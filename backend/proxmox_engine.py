import asyncio
import urllib.parse
import httpx
import paramiko
from models import ProxmoxNode
from schemas import VMProvisionRequest

class ProxmoxEngine:
    def __init__(self, node: ProxmoxNode):
        self.node = node
        self.base_url = f"https://{node.host}:{node.port}/api2/json"
        self.headers = {
            "Authorization": f"PVEAPIToken={node.token_name}={node.token_secret}"
        }

    async def api_request(self, method: str, endpoint: str, data: dict = None):
        url = f"{self.base_url}{endpoint}"
        async with httpx.AsyncClient(verify=self.node.verify_ssl, timeout=30.0) as client:
            resp = await client.request(method, url, headers=self.headers, data=data)
            if resp.status_code >= 400:
                raise Exception(f"PVE API {resp.status_code}: {resp.text}")
            return resp.json().get("data")

    async def get_next_vmid(self) -> int:
        data = await self.api_request("GET", "/cluster/nextid")
        return int(data)

    async def wait_for_task(self, upid: str, timeout: int = 180):
        encoded = urllib.parse.quote(upid, safe="")
        elapsed = 0
        while elapsed < timeout:
            status = await self.api_request("GET", f"/nodes/{self.node.name}/tasks/{encoded}/status")
            if status.get("status") == "stopped":
                if status.get("exitstatus") == "OK":
                    return True
                raise Exception(f"Proxmox Task Error: {status.get('exitstatus')}")
            await asyncio.sleep(2)
            elapsed += 2
        raise TimeoutError(f"Task {upid} timeout setelah {timeout} detik.")

    def exec_ssh(self, command: str) -> dict:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            client.connect(
                hostname=self.node.host,
                port=self.node.ssh_port,
                username=self.node.ssh_user,
                password=self.node.ssh_password,
                timeout=12
            )
            stdin, stdout, stderr = client.exec_command(command, timeout=60)
            out = stdout.read().decode("utf-8", errors="replace").strip()
            err = stderr.read().decode("utf-8", errors="replace").strip()
            exit_code = stdout.channel.recv_exit_status()
            return {"exit_code": exit_code, "stdout": out, "stderr": err}
        finally:
            client.close()

    async def test_connectivity(self) -> dict:
        ver = await self.api_request("GET", "/version")
        ssh_res = self.exec_ssh("pveversion && uptime -p")
        return {
            "api_version": ver.get("version"),
            "ssh_output": ssh_res["stdout"],
            "ssh_exit_code": ssh_res["exit_code"]
        }

    def upload_cloud_init_yaml(self, vmid: int, req: VMProvisionRequest, script_lines: list[str]) -> str:
        ssh_keys_section = ""
        if req.ssh_public_key and req.ssh_public_key.strip():
            ssh_keys_section = f"    ssh_authorized_keys:\n      - {req.ssh_public_key.strip()}\n"

        cmds = []
        if req.enable_root_ssh:
            cmds.extend([
                "sed -i 's/^#*PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config",
                "sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config",
                "systemctl restart ssh || systemctl restart sshd"
            ])
        cmds.extend([line for line in script_lines if line.strip()])
        runcmd_block = "\n".join([f"  - {c}" for c in cmds]) if cmds else "  - echo 'Provisioning complete'"

        yaml_body = f"""#cloud-config
hostname: {req.hostname}
manage_etc_hosts: true
chpasswd:
  expire: false
  list: |
    {req.ci_user}:{req.ci_password}
    root:{req.ci_password}
ssh_pwauth: true
users:
  - default
  - name: {req.ci_user}
    sudo: ALL=(ALL) NOPASSWD:ALL
    shell: /bin/bash
    lock_passwd: false
{ssh_keys_section}package_update: true
runcmd:
{runcmd_block}
"""
        filename = f"vm-{vmid}-cloudinit.yaml"
        remote_dir = self.node.snippets_dir.rstrip("/")
        remote_path = f"{remote_dir}/{filename}"

        # Pastikan direktori snippets tersedia lalu unggah via SFTP
        self.exec_ssh(f"mkdir -p {remote_dir}")
        transport = paramiko.Transport((self.node.host, self.node.ssh_port))
        transport.connect(username=self.node.ssh_user, password=self.node.ssh_password)
        sftp = paramiko.SFTPClient.from_transport(transport)
        try:
            with sftp.file(remote_path, "w") as f:
                f.write(yaml_body)
        finally:
            sftp.close()
            transport.close()

        return f"{self.node.snippets_storage}:snippets/{filename}"

    async def provision_vm(
        self,
        req: VMProvisionRequest,
        template_vmid: int,
        script_lines: list[str]
    ) -> dict:
        vmid = req.new_vmid or await self.get_next_vmid()
        cloned = False

        try:
            # 1. Clone Template
            clone_upid = await self.api_request(
                "POST",
                f"/nodes/{self.node.name}/qemu/{template_vmid}/clone",
                {
                    "newid": vmid,
                    "name": req.hostname,
                    "storage": req.target_storage,
                    "full": 1
                }
            )
            cloned = True
            await self.wait_for_task(clone_upid)

            # 2. Resize Disk
            resize_upid = await self.api_request(
                "PUT",
                f"/nodes/{self.node.name}/qemu/{vmid}/resize",
                {"disk": req.disk_interface, "size": f"{req.disk_gb}G"}
            )
            if isinstance(resize_upid, str) and resize_upid.startswith("UPID:"):
                await self.wait_for_task(resize_upid)

            # 3. Konfigurasi Hardware, VLAN & Cloud-Init
            net0 = f"virtio,bridge={req.bridge}"
            if req.vlan_tag:
                net0 += f",tag={req.vlan_tag}"

            if req.ip_cidr.lower() == "dhcp":
                ipconfig0 = "ip=dhcp"
            else:
                ipconfig0 = f"ip={req.ip_cidr}"
                if req.gateway:
                    ipconfig0 += f",gw={req.gateway}"

            cfg = {
                "cores": req.cores,
                "memory": req.memory_mb,
                "net0": net0,
                "ipconfig0": ipconfig0,
                "nameserver": req.nameserver,
                "onboot": 1
            }

            if script_lines or req.enable_root_ssh:
                snippet_vol = self.upload_cloud_init_yaml(vmid, req, script_lines)
                cfg["cicustom"] = f"user={snippet_vol}"
            else:
                cfg["ciuser"] = req.ci_user
                cfg["cipassword"] = req.ci_password
                if req.ssh_public_key:
                    cfg["sshkeys"] = urllib.parse.quote(req.ssh_public_key.strip(), safe="")

            cfg_upid = await self.api_request("POST", f"/nodes/{self.node.name}/qemu/{vmid}/config", cfg)
            if isinstance(cfg_upid, str) and cfg_upid.startswith("UPID:"):
                await self.wait_for_task(cfg_upid)

            # 4. Start VM
            start_upid = await self.api_request("POST", f"/nodes/{self.node.name}/qemu/{vmid}/status/start")
            await self.wait_for_task(start_upid)

            return {"vmid": vmid, "status": "running"}

        except Exception as exc:
            if cloned:
                try:
                    await self.api_request("POST", f"/nodes/{self.node.name}/qemu/{vmid}/status/stop")
                    await asyncio.sleep(3)
                    await self.api_request("DELETE", f"/nodes/{self.node.name}/qemu/{vmid}")
                except Exception:
                    pass
            raise exc

    async def power_action(self, vmid: int, action: str):
        if action in ["start", "stop", "reboot"]:
            upid = await self.api_request("POST", f"/nodes/{self.node.name}/qemu/{vmid}/status/{action}")
            await self.wait_for_task(upid)
            return {"vmid": vmid, "action": action}
        elif action == "delete":
            try:
                stop_upid = await self.api_request("POST", f"/nodes/{self.node.name}/qemu/{vmid}/status/stop")
                await self.wait_for_task(stop_upid)
            except Exception:
                pass
            del_upid = await self.api_request("DELETE", f"/nodes/{self.node.name}/qemu/{vmid}")
            await self.wait_for_task(del_upid)
            return {"vmid": vmid, "action": "deleted"}
        raise ValueError("Action tidak valid")