from pydantic import BaseModel, Field
from typing import Optional

class LoginRequest(BaseModel):
    username: str
    password: str

class NodeCreate(BaseModel):
    name: str = Field(..., example="pve-core-01")
    host: str = Field(..., example="192.168.10.2")
    port: int = 8006
    token_name: str = Field(..., example="root@pam!automation")
    token_secret: str = Field(..., example="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")
    verify_ssl: bool = False
    default_storage: str = "local-lvm"
    snippets_storage: str = "local"
    snippets_dir: str = "/var/lib/vz/snippets"
    ssh_port: int = 22
    ssh_user: str = "root"
    ssh_password: str

class VlanPoolCreate(BaseModel):
    node_name: str
    bridge: str = "vmbr0"
    vlan_tag: Optional[int] = None
    label: str
    subnet_cidr: str
    gateway: str
    dns: str = "1.1.1.1 8.8.8.8"
    sample_next_ip: str

class OsCatalogCreate(BaseModel):
    slug: str
    name: str
    os_family: str = "linux"
    template_vmid: int
    default_user: str = "ubuntu"
    min_cores: int = 1
    min_ram_mb: int = 1024
    min_disk_gb: int = 10
    cloud_image_url: Optional[str] = ""

class AppCatalogCreate(BaseModel):
    slug: str
    name: str
    category: str = "Container"
    compatible_os: str = "ubuntu-2404,debian-12"
    default_ports: str = "80,443"
    runcmd_script: str

class SshExecRequest(BaseModel):
    command: str

class VMProvisionRequest(BaseModel):
    node_name: str
    os_slug: str
    app_slug: Optional[str] = None
    new_vmid: Optional[int] = None
    hostname: str
    target_storage: str = "local-lvm"
    disk_interface: str = "scsi0"
    cores: int = Field(2, ge=1, le=128)
    memory_mb: int = Field(2048, ge=512)
    disk_gb: int = Field(20, ge=1)
    bridge: str = "vmbr0"
    vlan_tag: Optional[int] = None
    ip_cidr: str = "dhcp"
    gateway: Optional[str] = None
    nameserver: str = "1.1.1.1 8.8.8.8"
    ci_user: str = "root"
    ci_password: str
    ssh_public_key: Optional[str] = None
    enable_root_ssh: bool = True
    custom_runcmd: Optional[str] = None