from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime
from datetime import datetime, timezone
from database import Base

class ProxmoxNode(Base):
    __tablename__ = "proxmox_nodes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    host = Column(String, nullable=False)
    port = Column(Integer, default=8006)
    token_name = Column(String, nullable=False)
    token_secret = Column(String, nullable=False)
    verify_ssl = Column(Boolean, default=False)
    default_storage = Column(String, default="local-lvm")
    snippets_storage = Column(String, default="local")
    snippets_dir = Column(String, default="/var/lib/vz/snippets")
    # Kredensial SSH Node Proxmox
    ssh_port = Column(Integer, default=22)
    ssh_user = Column(String, default="root")
    ssh_password = Column(String, nullable=False)

class VlanPool(Base):
    __tablename__ = "vlan_pools"

    id = Column(Integer, primary_key=True, index=True)
    node_name = Column(String, nullable=False)
    bridge = Column(String, default="vmbr0")
    vlan_tag = Column(Integer, nullable=True)  # None = Untagged
    label = Column(String, nullable=False)
    subnet_cidr = Column(String, nullable=False)
    gateway = Column(String, nullable=False)
    dns = Column(String, default="1.1.1.1 8.8.8.8")
    sample_next_ip = Column(String, nullable=False)

class OsCatalog(Base):
    __tablename__ = "os_catalog"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    os_family = Column(String, default="linux")
    template_vmid = Column(Integer, nullable=False)
    default_user = Column(String, default="ubuntu")
    min_cores = Column(Integer, default=1)
    min_ram_mb = Column(Integer, default=1024)
    min_disk_gb = Column(Integer, default=10)
    cloud_image_url = Column(String, nullable=True)

class AppCatalog(Base):
    __tablename__ = "app_catalog"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    category = Column(String, default="System")
    compatible_os = Column(String, default="ubuntu-2404,debian-12")
    default_ports = Column(String, default="80,443")
    runcmd_script = Column(Text, nullable=False)

class VmDeployment(Base):
    __tablename__ = "vm_deployments"

    id = Column(Integer, primary_key=True, index=True)
    vmid = Column(Integer, nullable=False)
    hostname = Column(String, nullable=False)
    node_name = Column(String, nullable=False)
    os_slug = Column(String, nullable=False)
    app_slug = Column(String, nullable=True)
    cores = Column(Integer, nullable=False)
    memory_mb = Column(Integer, nullable=False)
    disk_gb = Column(Integer, nullable=False)
    bridge = Column(String, nullable=False)
    vlan_tag = Column(Integer, nullable=True)
    ip_cidr = Column(String, nullable=False)
    gateway = Column(String, nullable=True)
    ci_user = Column(String, nullable=False)
    status = Column(String, default="running")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))