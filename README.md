# PVE Ops Manager — Proxmox VE Provisioner & Infrastructure Console

Platform satu pintu untuk manajemen Node Proxmox VE (REST API + akses SSH/SFTP), manajemen VLAN & IP Pool, CRUD Katalog OS Cloud-Init, CRUD Katalog Aplikasi (`runcmd` bash scripts), dan pembuatan VM otomatis.

## Cara Menjalankan secara Lokal (Development)

### 1. Jalankan Backend (FastAPI)
```bash
cd backend
python -m venv venv
# Windows: venv\Scripts\activate | Linux/Mac: source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000