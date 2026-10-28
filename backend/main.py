import os
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import Base, engine, get_db, SessionLocal
from models import ProxmoxNode, VlanPool, OsCatalog, AppCatalog, VmDeployment
from schemas import (
    LoginRequest, NodeCreate, VlanPoolCreate, OsCatalogCreate,
    AppCatalogCreate, SshExecRequest, VMProvisionRequest
)
from proxmox_engine import ProxmoxEngine

Base.metadata.create_all(bind=engine)

app = FastAPI(title="PVE Ops Manager API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ADMIN_USER = os.getenv("ADMIN_USER", "admin")
ADMIN_PASS = os.getenv("ADMIN_PASS", "proxmox2026")

# ==========================================
# SEED DATA AWAL
# ==========================================
def seed_initial_data():
    db = SessionLocal()
    try:
        if db.query(ProxmoxNode).count() == 0:
            db.add(ProxmoxNode(
                name="pve-core-01",
                host="192.168.10.2",
                port=8006,
                token_name="root@pam!automation",
                token_secret="a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                verify_ssl=False,
                default_storage="local-lvm",
                snippets_storage="local",
                snippets_dir="/var/lib/vz/snippets",
                ssh_port=22,
                ssh_user="root",
                ssh_password="RootPassword123!"
            ))

        if db.query(VlanPool).count() == 0:
            db.add_all([
                VlanPool(
                    node_name="pve-core-01",
                    bridge="vmbr0",
                    vlan_tag=123,
                    label="VLAN 123 - Public / Transit",
                    subnet_cidr="10.10.123.0/24",
                    gateway="10.10.123.1",
                    dns="1.1.1.1 8.8.8.8",
                    sample_next_ip="10.10.123.25/24"
                ),
                VlanPool(
                    node_name="pve-core-01",
                    bridge="vmbr0",
                    vlan_tag=10,
                    label="VLAN 10 - Core Management",
                    subnet_cidr="192.168.10.0/24",
                    gateway="192.168.10.1",
                    dns="1.1.1.1 8.8.8.8",
                    sample_next_ip="192.168.10.55/24"
                )
            ])

        if db.query(OsCatalog).count() == 0:
            db.add_all([
                OsCatalog(
                    slug="ubuntu-2404",
                    name="Ubuntu 24.04 LTS (Noble)",
                    os_family="linux",
                    template_vmid=9001,
                    default_user="ubuntu",
                    min_cores=1,
                    min_ram_mb=1024,
                    min_disk_gb=10,
                    cloud_image_url="https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img"
                ),
                OsCatalog(
                    slug="debian-12",
                    name="Debian 12 (Bookworm)",
                    os_family="linux",
                    template_vmid=9002,
                    default_user="debian",
                    min_cores=1,
                    min_ram_mb=1024,
                    min_disk_gb=10,
                    cloud_image_url="https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.qcow2"
                ),
                OsCatalog(
                    slug="mikrotik-chr",
                    name="MikroTik CHR 7.x RouterOS",
                    os_family="routeros",
                    template_vmid=9005,
                    default_user="admin",
                    min_cores=1,
                    min_ram_mb=512,
                    min_disk_gb=1,
                    cloud_image_url="https://download.mikrotik.com/routeros/7.15.3/chr-7.15.3.img.zip"
                )
            ])

        if db.query(AppCatalog).count() == 0:
            db.add_all([
                AppCatalog(
                    slug="docker-portainer",
                    name="Docker CE + Portainer Server",
                    category="Container",
                    compatible_os="ubuntu-2404,debian-12",
                    default_ports="9443,8000",
                    runcmd_script="\n".join([
                        "curl -fsSL https://get.docker.com | sh",
                        "systemctl enable --now docker",
                        "docker volume create portainer_data",
                        "docker run -d -p 8000:8000 -p 9443:9443 --name portainer --restart=always -v /var/run/docker.sock:/var/run/docker.sock -v portainer_data:/data portainer/portainer-ce:latest"
                    ])
                ),
                AppCatalog(
                    slug="mikhmon-hotspot",
                    name="Mikhmon v3 Hotspot Server",
                    category="ISP / Network",
                    compatible_os="ubuntu-2404,debian-12",
                    default_ports="80",
                    runcmd_script="\n".join([
                        "apt-get update && apt-get install -y apache2 php libapache2-mod-php php-curl php-gd php-xml git",
                        "rm -rf /var/www/html/*",
                        "git clone https://github.com/laksa19/mikhmonv3.git /var/www/html",
                        "chown -R www-data:www-data /var/www/html",
                        "systemctl restart apache2"
                    ])
                ),
                AppCatalog(
                    slug="nginx-proxy-manager",
                    name="Nginx Proxy Manager (NPM)",
                    category="Reverse Proxy",
                    compatible_os="ubuntu-2404,debian-12",
                    default_ports="80,81,443",
                    runcmd_script="\n".join([
                        "curl -fsSL https://get.docker.com | sh",
                        "mkdir -p /opt/npm",
                        "printf 'services:\\n  app:\\n    image: jc21/nginx-proxy-manager:latest\\n    restart: unless-stopped\\n    ports:\\n      - \"80:80\"\\n      - \"81:81\"\\n      - \"443:443\"\\n    volumes:\\n      - ./data:/data\\n      - ./letsencrypt:/etc/letsencrypt\\n' > /opt/npm/docker-compose.yml",
                        "docker compose -f /opt/npm/docker-compose.yml up -d"
                    ])
                )
            ])
        db.commit()
    finally:
        db.close()

seed_initial_data()

# ==========================================
# AUTHENTICATION
# ==========================================
@app.post("/api/v1/auth/login")
def login(req: LoginRequest):
    if req.username == ADMIN_USER and req.password == ADMIN_PASS:
        return {"token": "pve-session-token-valid", "username": req.username}
    raise HTTPException(status_code=401, detail="Username atau password salah")

# ==========================================
# CRUD NODES & SSH
# ==========================================
@app.get("/api/v1/nodes")
def list_nodes(db: Session = Depends(get_db)):
    return db.query(ProxmoxNode).all()

@app.post("/api/v1/nodes")
def create_or_update_node(payload: NodeCreate, db: Session = Depends(get_db)):
    existing = db.query(ProxmoxNode).filter(ProxmoxNode.name == payload.name).first()
    if existing:
        for k, v in payload.model_dump().items():
            setattr(existing, k, v)
        db.commit()
        db.refresh(existing)
        return existing
    node = ProxmoxNode(**payload.model_dump())
    db.add(node)
    db.commit()
    db.refresh(node)
    return node

@app.delete("/api/v1/nodes/{node_id}")
def delete_node(node_id: int, db: Session = Depends(get_db)):
    node = db.query(ProxmoxNode).filter(ProxmoxNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node tidak ditemukan")
    db.delete(node)
    db.commit()
    return {"deleted": node_id}

@app.post("/api/v1/nodes/{node_name}/test")
async def test_node_connection(node_name: str, db: Session = Depends(get_db)):
    node = db.query(ProxmoxNode).filter(ProxmoxNode.name == node_name).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node tidak ditemukan")
    engine_client = ProxmoxEngine(node)
    try:
        return await engine_client.test_connectivity()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/nodes/{node_name}/ssh")
def run_node_ssh(node_name: str, req: SshExecRequest, db: Session = Depends(get_db)):
    node = db.query(ProxmoxNode).filter(ProxmoxNode.name == node_name).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node tidak ditemukan")
    engine_client = ProxmoxEngine(node)
    try:
        return engine_client.exec_ssh(req.command)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# CRUD VLAN & IPAM POOLS
# ==========================================
@app.get("/api/v1/vlans")
def list_vlans(db: Session = Depends(get_db)):
    return db.query(VlanPool).all()

@app.post("/api/v1/vlans")
def create_vlan(payload: VlanPoolCreate, db: Session = Depends(get_db)):
    vlan = VlanPool(**payload.model_dump())
    db.add(vlan)
    db.commit()
    db.refresh(vlan)
    return vlan

@app.delete("/api/v1/vlans/{vlan_id}")
def delete_vlan(vlan_id: int, db: Session = Depends(get_db)):
    vlan = db.query(VlanPool).filter(VlanPool.id == vlan_id).first()
    if not vlan:
        raise HTTPException(status_code=404, detail="VLAN tidak ditemukan")
    db.delete(vlan)
    db.commit()
    return {"deleted": vlan_id}

# ==========================================
# CRUD OS CATALOG
# ==========================================
@app.get("/api/v1/catalog/os")
def list_os(db: Session = Depends(get_db)):
    return db.query(OsCatalog).all()

@app.post("/api/v1/catalog/os")
def upsert_os(payload: OsCatalogCreate, db: Session = Depends(get_db)):
    existing = db.query(OsCatalog).filter(OsCatalog.slug == payload.slug).first()
    if existing:
        for k, v in payload.model_dump().items():
            setattr(existing, k, v)
        db.commit()
        db.refresh(existing)
        return existing
    item = OsCatalog(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item

@app.delete("/api/v1/catalog/os/{os_id}")
def delete_os(os_id: int, db: Session = Depends(get_db)):
    item = db.query(OsCatalog).filter(OsCatalog.id == os_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="OS tidak ditemukan")
    db.delete(item)
    db.commit()
    return {"deleted": os_id}

# ==========================================
# CRUD APP CATALOG & BASH SCRIPTS
# ==========================================
@app.get("/api/v1/catalog/apps")
def list_apps(db: Session = Depends(get_db)):
    return db.query(AppCatalog).all()

@app.post("/api/v1/catalog/apps")
def upsert_app(payload: AppCatalogCreate, db: Session = Depends(get_db)):
    existing = db.query(AppCatalog).filter(AppCatalog.slug == payload.slug).first()
    if existing:
        for k, v in payload.model_dump().items():
            setattr(existing, k, v)
        db.commit()
        db.refresh(existing)
        return existing
    item = AppCatalog(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item

@app.delete("/api/v1/catalog/apps/{app_id}")
def delete_app(app_id: int, db: Session = Depends(get_db)):
    item = db.query(AppCatalog).filter(AppCatalog.id == app_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="App tidak ditemukan")
    db.delete(item)
    db.commit()
    return {"deleted": app_id}

# ==========================================
# VM PROVISIONING & LIFECYCLE
# ==========================================
@app.get("/api/v1/vms")
def list_vms(db: Session = Depends(get_db)):
    return db.query(VmDeployment).order_by(VmDeployment.id.desc()).all()

@app.post("/api/v1/vms/provision")
async def provision_vm_endpoint(req: VMProvisionRequest, db: Session = Depends(get_db)):
    node = db.query(ProxmoxNode).filter(ProxmoxNode.name == req.node_name).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node Proxmox tidak ditemukan")

    os_item = db.query(OsCatalog).filter(OsCatalog.slug == req.os_slug).first()
    if not os_item:
        raise HTTPException(status_code=404, detail="OS Template tidak ditemukan")

    script_lines = []
    if req.app_slug:
        app_item = db.query(AppCatalog).filter(AppCatalog.slug == req.app_slug).first()
        if not app_item:
            raise HTTPException(status_code=404, detail="App tidak ditemukan")
        script_lines.extend(app_item.runcmd_script.splitlines())

    if req.custom_runcmd:
        script_lines.extend(req.custom_runcmd.splitlines())

    pve = ProxmoxEngine(node)
    try:
        res = await pve.provision_vm(req, os_item.template_vmid, script_lines)
        vm_record = VmDeployment(
            vmid=res["vmid"],
            hostname=req.hostname,
            node_name=req.node_name,
            os_slug=req.os_slug,
            app_slug=req.app_slug,
            cores=req.cores,
            memory_mb=req.memory_mb,
            disk_gb=req.disk_gb,
            bridge=req.bridge,
            vlan_tag=req.vlan_tag,
            ip_cidr=req.ip_cidr,
            gateway=req.gateway,
            ci_user=req.ci_user,
            status="running"
        )
        db.add(vm_record)
        db.commit()
        db.refresh(vm_record)
        return vm_record
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/vms/{vm_db_id}/power/{action}")
async def vm_power_control(vm_db_id: int, action: str, db: Session = Depends(get_db)):
    vm = db.query(VmDeployment).filter(VmDeployment.id == vm_db_id).first()
    if not vm:
        raise HTTPException(status_code=404, detail="VM tidak ditemukan di database")
    node = db.query(ProxmoxNode).filter(ProxmoxNode.name == vm.node_name).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node tidak ditemukan")

    pve = ProxmoxEngine(node)
    try:
        await pve.power_action(vm.vmid, action)
        if action == "delete":
            db.delete(vm)
        else:
            vm.status = "stopped" if action == "stop" else "running"
        db.commit()
        return {"status": "ok", "action": action}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))