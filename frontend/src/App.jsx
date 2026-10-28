import React, { useState, useEffect, useMemo } from 'react';
import {
  Server, Cpu, HardDrive, Network, Terminal, Plus, Trash2, Play, Square,
  RotateCcw, CheckCircle2, AlertCircle, Lock, LogOut, Code2, Eye, EyeOff,
  Layers, Box, RefreshCw, ShieldCheck, ChevronRight, Copy, Check
} from 'lucide-react';

const DEFAULT_API = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const INITIAL_NODES = [
  {
    id: 1,
    name: 'pve-core-01',
    host: '192.168.10.2',
    port: 8006,
    token_name: 'root@pam!automation',
    token_secret: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    verify_ssl: false,
    default_storage: 'local-lvm',
    snippets_storage: 'local',
    snippets_dir: '/var/lib/vz/snippets',
    ssh_port: 22,
    ssh_user: 'root',
    ssh_password: 'RootPassword123!'
  }
];

const INITIAL_VLANS = [
  {
    id: 1,
    node_name: 'pve-core-01',
    bridge: 'vmbr0',
    vlan_tag: 123,
    label: 'VLAN 123 - Public / Transit',
    subnet_cidr: '10.10.123.0/24',
    gateway: '10.10.123.1',
    dns: '1.1.1.1 8.8.8.8',
    sample_next_ip: '10.10.123.25/24'
  },
  {
    id: 2,
    node_name: 'pve-core-01',
    bridge: 'vmbr0',
    vlan_tag: 10,
    label: 'VLAN 10 - Core Management',
    subnet_cidr: '192.168.10.0/24',
    gateway: '192.168.10.1',
    dns: '1.1.1.1 8.8.8.8',
    sample_next_ip: '192.168.10.55/24'
  }
];

const INITIAL_OS = [
  {
    id: 1,
    slug: 'ubuntu-2404',
    name: 'Ubuntu 24.04 LTS (Noble)',
    os_family: 'linux',
    template_vmid: 9001,
    default_user: 'ubuntu',
    min_cores: 1,
    min_ram_mb: 1024,
    min_disk_gb: 10,
    cloud_image_url: 'https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img'
  },
  {
    id: 2,
    slug: 'debian-12',
    name: 'Debian 12 (Bookworm)',
    os_family: 'linux',
    template_vmid: 9002,
    default_user: 'debian',
    min_cores: 1,
    min_ram_mb: 1024,
    min_disk_gb: 10,
    cloud_image_url: 'https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.qcow2'
  },
  {
    id: 3,
    slug: 'mikrotik-chr',
    name: 'MikroTik CHR 7.x RouterOS',
    os_family: 'routeros',
    template_vmid: 9005,
    default_user: 'admin',
    min_cores: 1,
    min_ram_mb: 512,
    min_disk_gb: 1,
    cloud_image_url: 'https://download.mikrotik.com/routeros/7.15.3/chr-7.15.3.img.zip'
  }
];

const INITIAL_APPS = [
  {
    id: 1,
    slug: 'docker-portainer',
    name: 'Docker CE + Portainer Server',
    category: 'Container',
    compatible_os: 'ubuntu-2404,debian-12',
    default_ports: '9443,8000',
    runcmd_script: [
      'curl -fsSL https://get.docker.com | sh',
      'systemctl enable --now docker',
      'docker volume create portainer_data',
      'docker run -d -p 8000:8000 -p 9443:9443 --name portainer --restart=always -v /var/run/docker.sock:/var/run/docker.sock -v portainer_data:/data portainer/portainer-ce:latest'
    ].join('\n')
  },
  {
    id: 2,
    slug: 'mikhmon-hotspot',
    name: 'Mikhmon v3 Hotspot Server',
    category: 'ISP / Network',
    compatible_os: 'ubuntu-2404,debian-12',
    default_ports: '80',
    runcmd_script: [
      'apt-get update && apt-get install -y apache2 php libapache2-mod-php php-curl php-gd php-xml git',
      'rm -rf /var/www/html/*',
      'git clone https://github.com/laksa19/mikhmonv3.git /var/www/html',
      'chown -R www-data:www-data /var/www/html',
      'systemctl restart apache2'
    ].join('\n')
  },
  {
    id: 3,
    slug: 'nginx-proxy-manager',
    name: 'Nginx Proxy Manager (NPM)',
    category: 'Reverse Proxy',
    compatible_os: 'ubuntu-2404,debian-12',
    default_ports: '80,81,443',
    runcmd_script: [
      'curl -fsSL https://get.docker.com | sh',
      'mkdir -p /opt/npm',
      'docker compose -f /opt/npm/docker-compose.yml up -d'
    ].join('\n')
  }
];

export default function App() {
  const [session, setSession] = useState(() => localStorage.getItem('pve_ops_session') || '');
  const [loginUser, setLoginUser] = useState('admin');
  const [loginPass, setLoginPass] = useState('proxmox2026');
  const [loginError, setLoginError] = useState('');

  const [apiBase, setApiBase] = useState(() => localStorage.getItem('pve_api_base') || DEFAULT_API);
  const [liveMode, setLiveMode] = useState(false);
  const [activeTab, setActiveTab] = useState('deploy');
  const [toast, setToast] = useState(null);
  const [copied, setCopied] = useState(false);

  // State Entities
  const [nodes, setNodes] = useState(() => JSON.parse(localStorage.getItem('pve_nodes')) || INITIAL_NODES);
  const [vlans, setVlans] = useState(() => JSON.parse(localStorage.getItem('pve_vlans')) || INITIAL_VLANS);
  const [osList, setOsList] = useState(() => JSON.parse(localStorage.getItem('pve_os')) || INITIAL_OS);
  const [appList, setAppList] = useState(() => JSON.parse(localStorage.getItem('pve_apps')) || INITIAL_APPS);
  const [vms, setVms] = useState(() => JSON.parse(localStorage.getItem('pve_vms')) || []);

  // Deploy Form State
  const [deployMode, setDeployMode] = useState('os'); // 'os' | 'app'
  const [form, setForm] = useState({
    node_name: 'pve-core-01',
    target_storage: 'local-lvm',
    disk_interface: 'scsi0',
    os_slug: 'ubuntu-2404',
    app_slug: '',
    new_vmid: '',
    hostname: 'srv-prod-01',
    cores: 2,
    memory_mb: 2048,
    disk_gb: 20,
    bridge: 'vmbr0',
    vlan_tag: 123,
    ip_cidr: '10.10.123.25/24',
    gateway: '10.10.123.1',
    nameserver: '1.1.1.1 8.8.8.8',
    ci_user: 'ubuntu',
    ci_password: 'PasswordKuat2026!',
    ssh_public_key: '',
    enable_root_ssh: true,
    custom_runcmd: ''
  });
  const [deploying, setDeploying] = useState(false);
  const [showPass, setShowPass] = useState(false);

  // Node & SSH Form State
  const [nodeForm, setNodeForm] = useState({
    name: '',
    host: '',
    port: 8006,
    token_name: 'root@pam!automation',
    token_secret: '',
    default_storage: 'local-lvm',
    snippets_storage: 'local',
    snippets_dir: '/var/lib/vz/snippets',
    ssh_port: 22,
    ssh_user: 'root',
    ssh_password: ''
  });
  const [sshCommand, setSshCommand] = useState('pveversion -v && qm list');
  const [sshOutput, setSshOutput] = useState('');
  const [selectedSshNode, setSelectedSshNode] = useState('pve-core-01');

  // VLAN Form State
  const [vlanForm, setVlanForm] = useState({
    node_name: 'pve-core-01',
    bridge: 'vmbr0',
    vlan_tag: 123,
    label: '',
    subnet_cidr: '',
    gateway: '',
    dns: '1.1.1.1 8.8.8.8',
    sample_next_ip: ''
  });

  // OS Form State
  const [osForm, setOsForm] = useState({
    slug: '',
    name: '',
    os_family: 'linux',
    template_vmid: 9010,
    default_user: 'ubuntu',
    min_cores: 1,
    min_ram_mb: 1024,
    min_disk_gb: 10,
    cloud_image_url: ''
  });

  // App Form State
  const [appForm, setAppForm] = useState({
    slug: '',
    name: '',
    category: 'Container',
    compatible_os: 'ubuntu-2404,debian-12',
    default_ports: '80,443',
    runcmd_script: ''
  });

  const notify = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    localStorage.setItem('pve_nodes', JSON.stringify(nodes));
    localStorage.setItem('pve_vlans', JSON.stringify(vlans));
    localStorage.setItem('pve_os', JSON.stringify(osList));
    localStorage.setItem('pve_apps', JSON.stringify(appList));
    localStorage.setItem('pve_vms', JSON.stringify(vms));
  }, [nodes, vlans, osList, appList, vms]);

  const syncFromBackend = async () => {
    try {
      const [nRes, vRes, oRes, aRes, vmRes] = await Promise.all([
        fetch(`${apiBase}/nodes`),
        fetch(`${apiBase}/vlans`),
        fetch(`${apiBase}/catalog/os`),
        fetch(`${apiBase}/catalog/apps`),
        fetch(`${apiBase}/vms`)
      ]);
      if (nRes.ok) setNodes(await nRes.json());
      if (vRes.ok) setVlans(await vRes.json());
      if (oRes.ok) setOsList(await oRes.json());
      if (aRes.ok) setAppList(await aRes.json());
      if (vmRes.ok) setVms(await vmRes.json());
      setLiveMode(true);
      notify('Tersinkronisasi dengan Backend FastAPI');
    } catch {
      setLiveMode(false);
      notify('Backend tidak terjangkau — menggunakan state lokal', 'err');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUser, password: loginPass })
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('pve_ops_session', data.token);
        setSession(data.token);
        syncFromBackend();
        return;
      }
    } catch {
      // Fallback local auth
    }
    if (loginUser === 'admin' && loginPass === 'proxmox2026') {
      localStorage.setItem('pve_ops_session', 'local-session');
      setSession('local-session');
    } else {
      setLoginError('Kredensial tidak valid (Default: admin / proxmox2026)');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('pve_ops_session');
    setSession('');
  };

  // Cloud-Init YAML Live Preview
  const cloudInitPreview = useMemo(() => {
    const selectedApp = appList.find((a) => a.slug === form.app_slug);
    const lines = [];
    if (form.enable_root_ssh) {
      lines.push(
        "sed -i 's/^#*PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config",
        "sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config",
        'systemctl restart ssh || systemctl restart sshd'
      );
    }
    if (deployMode === 'app' && selectedApp?.runcmd_script) {
      lines.push(...selectedApp.runcmd_script.split('\n').filter(Boolean));
    }
    if (form.custom_runcmd) {
      lines.push(...form.custom_runcmd.split('\n').filter(Boolean));
    }
    const runcmdFormatted = lines.length
      ? lines.map((l) => `  - ${l}`).join('\n')
      : "  - echo 'Provisioning complete'";

    return `#cloud-config
hostname: ${form.hostname}
manage_etc_hosts: true
chpasswd:
  expire: false
  list: |
    ${form.ci_user}:${form.ci_password}
    root:${form.ci_password}
ssh_pwauth: true
users:
  - default
  - name: ${form.ci_user}
    sudo: ALL=(ALL) NOPASSWD:ALL
    shell: /bin/bash
runcmd:
${runcmdFormatted}`;
  }, [form, deployMode, appList]);

  // Provision VM Handler
  const handleProvision = async (e) => {
    e.preventDefault();
    setDeploying(true);
    const payload = {
      ...form,
      app_slug: deployMode === 'app' ? form.app_slug : null,
      new_vmid: form.new_vmid ? Number(form.new_vmid) : null,
      vlan_tag: form.vlan_tag ? Number(form.vlan_tag) : null
    };

    try {
      if (liveMode) {
        const res = await fetch(`${apiBase}/vms/provision`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Gagal membuat VM');
        setVms((prev) => [data, ...prev]);
      } else {
        await new Promise((r) => setTimeout(r, 900));
        const mockVm = {
          id: Date.now(),
          vmid: payload.new_vmid || Math.floor(100 + Math.random() * 800),
          hostname: payload.hostname,
          node_name: payload.node_name,
          os_slug: payload.os_slug,
          app_slug: payload.app_slug,
          cores: payload.cores,
          memory_mb: payload.memory_mb,
          disk_gb: payload.disk_gb,
          bridge: payload.bridge,
          vlan_tag: payload.vlan_tag,
          ip_cidr: payload.ip_cidr,
          gateway: payload.gateway,
          ci_user: payload.ci_user,
          status: 'running'
        };
        setVms((prev) => [mockVm, ...prev]);
      }
      notify(`Instance ${payload.hostname} berhasil dideploy`);
      setActiveTab('vms');
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setDeploying(false);
    }
  };

  // Save Node (API + SSH)
  const handleSaveNode = async (e) => {
    e.preventDefault();
    if (!nodeForm.name || !nodeForm.host) return;
    if (liveMode) {
      const res = await fetch(`${apiBase}/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nodeForm)
      });
      if (res.ok) {
        await syncFromBackend();
        notify(`Node ${nodeForm.name} disimpan ke database`);
        return;
      }
    }
    setNodes((prev) => {
      const filtered = prev.filter((n) => n.name !== nodeForm.name);
      return [...filtered, { ...nodeForm, id: Date.now() }];
    });
    notify(`Node ${nodeForm.name} disimpan`);
  };

  // Run SSH Command on Proxmox Node
  const handleRunSsh = async () => {
    setSshOutput('Connecting via SSH...');
    if (liveMode) {
      try {
        const res = await fetch(`${apiBase}/nodes/${selectedSshNode}/ssh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: sshCommand })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail);
        setSshOutput(data.stdout || data.stderr || `Exit Code: ${data.exit_code}`);
        return;
      } catch (err) {
        setSshOutput(`SSH Error: ${err.message}`);
        return;
      }
    }
    const target = nodes.find((n) => n.name === selectedSshNode);
    setSshOutput(
      `[root@${target?.host || '192.168.10.2'}:${target?.ssh_port || 22}]# ${sshCommand}\n` +
      `proxmox-ve: 8.2.0 (running kernel: 6.8.12-2-pve)\n` +
      `VMID NAME                 STATUS     MEM(MB)    BOOTDISK(GB)\n` +
      `9001 ubuntu-2404-tpl      stopped    1024       10.00\n` +
      `9002 debian-12-tpl        stopped    1024       10.00`
    );
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-[#09090b] text-zinc-100 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-[#111113] border border-[#232329] rounded-md p-6">
          <div className="flex items-center gap-2.5 mb-6 pb-4 border-b border-[#232329]">
            <div className="w-7 h-7 rounded bg-zinc-100 text-zinc-950 flex items-center justify-center font-mono font-bold text-xs">
              PVE
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight">PVE Ops Manager</h1>
              <p className="text-[11px] text-zinc-400 font-mono">Infrastructure & Cloud-Init Console</p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1">
                FastAPI Endpoint URL
              </label>
              <input
                type="text"
                value={apiBase}
                onChange={(e) => {
                  setApiBase(e.target.value);
                  localStorage.setItem('pve_api_base', e.target.value);
                }}
                className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-400"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1">
                Operator Username
              </label>
              <input
                type="text"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-400"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1">
                Password
              </label>
              <input
                type="password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-400"
              />
            </div>
            {loginError && (
              <p className="text-xs text-red-400 font-mono bg-red-950/30 border border-red-900/50 rounded p-2">
                {loginError}
              </p>
            )}
            <button
              type="submit"
              className="w-full bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-xs py-2 rounded transition"
            >
              Sign In to Console
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col">
      {/* Top Header */}
      <header className="h-12 border-b border-[#232329] bg-[#0d0d10] px-5 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded bg-zinc-100 text-zinc-950 flex items-center justify-center font-mono font-bold text-[11px]">
              PVE
            </div>
            <span className="text-xs font-semibold tracking-tight">PVE Ops Manager</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
              v2.0
            </span>
          </div>

          <nav className="flex items-center gap-1">
            {[
              { id: 'deploy', label: 'Deploy Instance', icon: Plus },
              { id: 'vms', label: `Instances (${vms.length})`, icon: Server },
              { id: 'nodes', label: 'Nodes, SSH & VLAN', icon: Network },
              { id: 'os', label: 'OS Catalog', icon: HardDrive },
              { id: 'apps', label: 'App Catalog & Scripts', icon: Terminal }
            ].map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition ${
                    active
                      ? 'bg-zinc-800/90 text-white font-medium'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={syncFromBackend}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#27272a] bg-[#111113] text-[11px] font-mono text-zinc-300 hover:border-zinc-600"
          >
            <span className={`w-2 h-2 rounded-full ${liveMode ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            {liveMode ? 'API Connected' : 'Local Mode'}
            <RefreshCw className="w-3 h-3 ml-1" />
          </button>
          <button
            onClick={handleLogout}
            className="text-zinc-400 hover:text-zinc-200 p-1.5 rounded hover:bg-zinc-900"
            title="Sign Out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 bg-[#141418] border border-zinc-700 text-xs font-mono px-4 py-2.5 rounded shadow-lg flex items-center gap-2">
          {toast.type === 'err' ? (
            <AlertCircle className="w-4 h-4 text-red-400" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          )}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
        {/* TAB 1: DEPLOY INSTANCE */}
        {activeTab === 'deploy' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form onSubmit={handleProvision} className="lg:col-span-8 space-y-5">
              {/* Target Node & Storage */}
              <section className="bg-[#111113] border border-[#232329] rounded-md p-4">
                <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400 mb-3">
                  1. Target Node & Storage Pool
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Proxmox Node</label>
                    <select
                      value={form.node_name}
                      onChange={(e) => setForm({ ...form, node_name: e.target.value })}
                      className="w-full bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                    >
                      {nodes.map((n) => (
                        <option key={n.name} value={n.name}>
                          {n.name} ({n.host})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Target Storage</label>
                    <input
                      type="text"
                      value={form.target_storage}
                      onChange={(e) => setForm({ ...form, target_storage: e.target.value })}
                      className="w-full bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">VMID (Kosong = Auto)</label>
                    <input
                      type="number"
                      placeholder="Auto Cluster NextID"
                      value={form.new_vmid}
                      onChange={(e) => setForm({ ...form, new_vmid: e.target.value })}
                      className="w-full bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                </div>
              </section>

              {/* OS & App Catalog Selection */}
              <section className="bg-[#111113] border border-[#232329] rounded-md p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                    2. Base Image & Turnkey Application
                  </h2>
                  <div className="flex border border-[#27272a] rounded overflow-hidden text-[11px] font-mono">
                    <button
                      type="button"
                      onClick={() => setDeployMode('os')}
                      className={`px-3 py-1 ${deployMode === 'os' ? 'bg-zinc-200 text-zinc-950 font-semibold' : 'bg-[#09090b] text-zinc-400'}`}
                    >
                      Pure OS
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeployMode('app');
                        if (!form.app_slug && appList.length) {
                          setForm({ ...form, app_slug: appList[0].slug });
                        }
                      }}
                      className={`px-3 py-1 ${deployMode === 'app' ? 'bg-zinc-200 text-zinc-950 font-semibold' : 'bg-[#09090b] text-zinc-400'}`}
                    >
                      OS + App Catalog
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-3">
                  {osList.map((os) => {
                    const selected = form.os_slug === os.slug;
                    return (
                      <button
                        type="button"
                        key={os.slug}
                        onClick={() =>
                          setForm({
                            ...form,
                            os_slug: os.slug,
                            ci_user: os.default_user,
                            disk_gb: Math.max(form.disk_gb, os.min_disk_gb)
                          })
                        }
                        className={`text-left p-3 rounded border transition ${
                          selected
                            ? 'border-zinc-200 bg-zinc-900/90'
                            : 'border-[#27272a] bg-[#09090b] hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">{os.name}</span>
                          <span className="text-[10px] font-mono text-zinc-400">#{os.template_vmid}</span>
                        </div>
                        <p className="text-[11px] font-mono text-zinc-400 mt-1">
                          user: {os.default_user} · min {os.min_disk_gb}GB
                        </p>
                      </button>
                    );
                  })}
                </div>

                {deployMode === 'app' && (
                  <div className="pt-3 border-t border-[#232329] grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {appList.map((appItem) => {
                      const selected = form.app_slug === appItem.slug;
                      return (
                        <button
                          type="button"
                          key={appItem.slug}
                          onClick={() => setForm({ ...form, app_slug: appItem.slug })}
                          className={`text-left p-3 rounded border transition ${
                            selected
                              ? 'border-zinc-200 bg-zinc-900/90'
                              : 'border-[#27272a] bg-[#09090b] hover:border-zinc-700'
                          }`}
                        >
                          <div className="text-xs font-medium">{appItem.name}</div>
                          <div className="text-[10px] font-mono text-zinc-400 mt-1">
                            {appItem.category} · Ports: {appItem.default_ports}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Compute Sizing & Network VLAN */}
              <section className="bg-[#111113] border border-[#232329] rounded-md p-4 space-y-4">
                <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                  3. Compute Sizing, Bridge & VLAN Tag
                </h2>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">vCPU Cores</label>
                    <input
                      type="number"
                      min="1"
                      value={form.cores}
                      onChange={(e) => setForm({ ...form, cores: Number(e.target.value) })}
                      className="w-full bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Memory (MB)</label>
                    <input
                      type="number"
                      step="512"
                      value={form.memory_mb}
                      onChange={(e) => setForm({ ...form, memory_mb: Number(e.target.value) })}
                      className="w-full bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Disk Size (GB)</label>
                    <input
                      type="number"
                      min="1"
                      value={form.disk_gb}
                      onChange={(e) => setForm({ ...form, disk_gb: Number(e.target.value) })}
                      className="w-full bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                </div>

                {/* Preset VLAN Pool Quick Fill */}
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    Quick Fill dari Profil VLAN / IP Pool
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {vlans.map((v) => (
                      <button
                        type="button"
                        key={v.id}
                        onClick={() =>
                          setForm({
                            ...form,
                            bridge: v.bridge,
                            vlan_tag: v.vlan_tag || '',
                            ip_cidr: v.sample_next_ip,
                            gateway: v.gateway,
                            nameserver: v.dns
                          })
                        }
                        className="px-2.5 py-1 rounded border border-[#27272a] bg-[#09090b] hover:border-zinc-500 text-[11px] font-mono"
                      >
                        {v.label} ({v.sample_next_ip})
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Linux Bridge</label>
                    <input
                      type="text"
                      value={form.bridge}
                      onChange={(e) => setForm({ ...form, bridge: e.target.value })}
                      className="w-full bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">VLAN Tag</label>
                    <input
                      type="number"
                      placeholder="Untagged"
                      value={form.vlan_tag}
                      onChange={(e) => setForm({ ...form, vlan_tag: e.target.value })}
                      className="w-full bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">IP CIDR / dhcp</label>
                    <input
                      type="text"
                      value={form.ip_cidr}
                      onChange={(e) => setForm({ ...form, ip_cidr: e.target.value })}
                      className="w-full bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Gateway</label>
                    <input
                      type="text"
                      value={form.gateway}
                      onChange={(e) => setForm({ ...form, gateway: e.target.value })}
                      className="w-full bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                </div>
              </section>

              {/* Credentials & Post-Boot Script */}
              <section className="bg-[#111113] border border-[#232329] rounded-md p-4 space-y-3">
                <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                  4. System Credentials & Initial Deploy Script
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Hostname</label>
                    <input
                      type="text"
                      required
                      value={form.hostname}
                      onChange={(e) => setForm({ ...form, hostname: e.target.value })}
                      className="w-full bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">SSH / OS Username</label>
                    <input
                      type="text"
                      required
                      value={form.ci_user}
                      onChange={(e) => setForm({ ...form, ci_user: e.target.value })}
                      className="w-full bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">OS & Root Password</label>
                    <div className="relative">
                      <input
                        type={showPass ? 'text' : 'password'}
                        required
                        value={form.ci_password}
                        onChange={(e) => setForm({ ...form, ci_password: e.target.value })}
                        className="w-full bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 pr-8 text-xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(!showPass)}
                        className="absolute right-2 top-2 text-zinc-400"
                      >
                        {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    Tambahan Bash Script Awal (Dijalankan otomatis saat First-Boot via Cloud-Init)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Contoh: apt-get install -y htop net-tools"
                    value={form.custom_runcmd}
                    onChange={(e) => setForm({ ...form, custom_runcmd: e.target.value })}
                    className="w-full bg-[#09090b] border border-[#27272a] rounded p-2.5 text-xs font-mono"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.enable_root_ssh}
                      onChange={(e) => setForm({ ...form, enable_root_ssh: e.target.checked })}
                    />
                    Aktifkan <code className="font-mono text-zinc-200">PermitRootLogin yes</code> & PasswordAuth di SSH
                  </label>

                  <button
                    type="submit"
                    disabled={deploying}
                    className="bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-xs px-5 py-2 rounded transition disabled:opacity-50"
                  >
                    {deploying ? 'Provisioning VM...' : 'Deploy Instance Now'}
                  </button>
                </div>
              </section>
            </form>

            {/* Right Inspector Column */}
            <aside className="lg:col-span-4 space-y-4">
              <div className="bg-[#111113] border border-[#232329] rounded-md p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono uppercase text-zinc-400">
                    Cloud-Init Snippet Preview
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(cloudInitPreview);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    className="text-[11px] font-mono text-zinc-400 hover:text-white flex items-center gap-1"
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    Copy YAML
                  </button>
                </div>
                <pre className="bg-[#09090b] border border-[#232329] rounded p-3 text-[11px] font-mono text-zinc-300 overflow-x-auto max-h-96">
                  {cloudInitPreview}
                </pre>
              </div>
            </aside>
          </div>
        )}

        {/* TAB 2: DEPLOYED VMS */}
        {activeTab === 'vms' && (
          <div className="bg-[#111113] border border-[#232329] rounded-md overflow-hidden">
            <div className="px-4 py-3 border-b border-[#232329] flex items-center justify-between">
              <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-300">
                Provisioned Virtual Machines
              </h2>
              <button
                onClick={() => setActiveTab('deploy')}
                className="bg-zinc-100 text-zinc-950 text-xs font-medium px-3 py-1 rounded"
              >
                + New Instance
              </button>
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#232329] text-[11px] font-mono text-zinc-400 bg-[#0d0d10]">
                  <th className="py-2.5 px-4">VMID / Hostname</th>
                  <th className="py-2.5 px-4">Node</th>
                  <th className="py-2.5 px-4">OS / App</th>
                  <th className="py-2.5 px-4">Specs</th>
                  <th className="py-2.5 px-4">Network & VLAN</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232329] font-mono">
                {vms.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-zinc-500">
                      Belum ada VM yang dideploy.
                    </td>
                  </tr>
                ) : (
                  vms.map((v) => (
                    <tr key={v.id} className="hover:bg-zinc-900/40">
                      <td className="py-2.5 px-4 font-medium text-zinc-100">
                        #{v.vmid} · {v.hostname}
                      </td>
                      <td className="py-2.5 px-4 text-zinc-400">{v.node_name}</td>
                      <td className="py-2.5 px-4">
                        <span>{v.os_slug}</span>
                        {v.app_slug && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200 text-[10px]">
                            +{v.app_slug}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-zinc-400">
                        {v.cores}C / {v.memory_mb}MB / {v.disk_gb}GB
                      </td>
                      <td className="py-2.5 px-4">
                        {v.bridge} {v.vlan_tag ? `(VLAN ${v.vlan_tag})` : '(Untagged)'} · {v.ip_cidr}
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] ${
                            v.status === 'running'
                              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/50'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {v.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right space-x-1">
                        <button
                          onClick={() =>
                            setVms((prev) =>
                              prev.map((item) =>
                                item.id === v.id
                                  ? { ...item, status: item.status === 'running' ? 'stopped' : 'running' }
                                  : item
                              )
                            )
                          }
                          className="p-1 rounded border border-[#27272a] hover:border-zinc-500"
                          title="Start/Stop"
                        >
                          {v.status === 'running' ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                        </button>
                        <button
                          onClick={() => setVms((prev) => prev.filter((item) => item.id !== v.id))}
                          className="p-1 rounded border border-[#27272a] hover:border-red-500 text-red-400"
                          title="Delete VM"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 3: NODES, SSH & VLAN CRUD */}
        {activeTab === 'nodes' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Form Tambah / Update Node + SSH */}
              <form
                onSubmit={handleSaveNode}
                className="lg:col-span-5 bg-[#111113] border border-[#232329] rounded-md p-4 space-y-3"
              >
                <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-300">
                  Add / Edit Proxmox Node (API + SSH Access)
                </h2>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Node Name</label>
                    <input
                      type="text"
                      required
                      placeholder="pve-core-01"
                      value={nodeForm.name}
                      onChange={(e) => setNodeForm({ ...nodeForm, name: e.target.value })}
                      className="w-full bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">PVE Host / IP</label>
                    <input
                      type="text"
                      required
                      placeholder="192.168.10.2"
                      value={nodeForm.host}
                      onChange={(e) => setNodeForm({ ...nodeForm, host: e.target.value })}
                      className="w-full bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">API Token ID</label>
                    <input
                      type="text"
                      required
                      value={nodeForm.token_name}
                      onChange={(e) => setNodeForm({ ...nodeForm, token_name: e.target.value })}
                      className="w-full bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">API Token Secret</label>
                    <input
                      type="password"
                      required
                      value={nodeForm.token_secret}
                      onChange={(e) => setNodeForm({ ...nodeForm, token_secret: e.target.value })}
                      className="w-full bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-[#232329]">
                  <span className="block text-[11px] font-mono uppercase text-zinc-400 mb-2">
                    Proxmox VE SSH Credentials (Untuk Upload Snippet & Eksekusi CLI)
                  </span>
                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">SSH User</label>
                      <input
                        type="text"
                        required
                        value={nodeForm.ssh_user}
                        onChange={(e) => setNodeForm({ ...nodeForm, ssh_user: e.target.value })}
                        className="w-full bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">SSH Password</label>
                      <input
                        type="password"
                        required
                        value={nodeForm.ssh_password}
                        onChange={(e) => setNodeForm({ ...nodeForm, ssh_password: e.target.value })}
                        className="w-full bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">SSH Port</label>
                      <input
                        type="number"
                        value={nodeForm.ssh_port}
                        onChange={(e) => setNodeForm({ ...nodeForm, ssh_port: Number(e.target.value) })}
                        className="w-full bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-xs py-2 rounded"
                >
                  Save Node & SSH Configuration
                </button>
              </form>

              {/* Daftar Node & Remote SSH Console */}
              <div className="lg:col-span-7 space-y-4">
                <div className="bg-[#111113] border border-[#232329] rounded-md p-4">
                  <h3 className="text-xs font-mono uppercase text-zinc-400 mb-3">
                    Registered Proxmox Nodes
                  </h3>
                  <div className="space-y-2">
                    {nodes.map((n) => (
                      <div
                        key={n.name}
                        className="flex items-center justify-between p-3 rounded border border-[#27272a] bg-[#09090b] text-xs font-mono"
                      >
                        <div>
                          <div className="font-semibold text-zinc-100">
                            {n.name} — {n.host}:{n.port}
                          </div>
                          <div className="text-[11px] text-zinc-400">
                            SSH: {n.ssh_user}@{n.host}:{n.ssh_port} · Storage: {n.default_storage}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setNodeForm(n)}
                            className="px-2.5 py-1 rounded border border-[#27272a] hover:border-zinc-500 text-[11px]"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setNodes((prev) => prev.filter((item) => item.name !== n.name))}
                            className="p-1 text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Direct SSH Runner */}
                <div className="bg-[#111113] border border-[#232329] rounded-md p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase text-zinc-400">
                      Node Direct SSH Runner
                    </span>
                    <select
                      value={selectedSshNode}
                      onChange={(e) => setSelectedSshNode(e.target.value)}
                      className="bg-[#09090b] border border-[#27272a] rounded px-2 py-1 text-xs font-mono"
                    >
                      {nodes.map((n) => (
                        <option key={n.name} value={n.name}>
                          {n.name} ({n.host})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={sshCommand}
                      onChange={(e) => setSshCommand(e.target.value)}
                      className="flex-1 bg-[#09090b] border border-[#27272a] rounded px-3 py-1.5 text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleRunSsh}
                      className="bg-zinc-100 text-zinc-950 font-medium text-xs px-4 py-1.5 rounded"
                    >
                      Run SSH
                    </button>
                  </div>
                  {sshOutput && (
                    <pre className="bg-[#09090b] border border-[#232329] rounded p-3 text-[11px] font-mono text-zinc-300 overflow-x-auto">
                      {sshOutput}
                    </pre>
                  )}
                </div>
              </div>
            </div>

            {/* VLAN & IPAM CRUD */}
            <div className="bg-[#111113] border border-[#232329] rounded-md p-4 space-y-4">
              <h3 className="text-xs font-mono uppercase text-zinc-400">
                VLAN & Subnet IP Pool Management
              </h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setVlans((prev) => [...prev, { ...vlanForm, id: Date.now() }]);
                  notify('Profil VLAN berhasil ditambahkan');
                }}
                className="grid grid-cols-2 sm:grid-cols-6 gap-2.5"
              >
                <input
                  type="text"
                  placeholder="Bridge (vmbr0)"
                  required
                  value={vlanForm.bridge}
                  onChange={(e) => setVlanForm({ ...vlanForm, bridge: e.target.value })}
                  className="bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                />
                <input
                  type="number"
                  placeholder="VLAN ID (123)"
                  value={vlanForm.vlan_tag}
                  onChange={(e) => setVlanForm({ ...vlanForm, vlan_tag: Number(e.target.value) })}
                  className="bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                />
                <input
                  type="text"
                  placeholder="Label (Public VLAN)"
                  required
                  value={vlanForm.label}
                  onChange={(e) => setVlanForm({ ...vlanForm, label: e.target.value })}
                  className="bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                />
                <input
                  type="text"
                  placeholder="Next IP (10.10.123.25/24)"
                  required
                  value={vlanForm.sample_next_ip}
                  onChange={(e) => setVlanForm({ ...vlanForm, sample_next_ip: e.target.value })}
                  className="bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                />
                <input
                  type="text"
                  placeholder="Gateway (10.10.123.1)"
                  required
                  value={vlanForm.gateway}
                  onChange={(e) => setVlanForm({ ...vlanForm, gateway: e.target.value })}
                  className="bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                />
                <button
                  type="submit"
                  className="bg-zinc-100 text-zinc-950 font-medium text-xs rounded px-3 py-1.5"
                >
                  + Add VLAN
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 4: OS CATALOG CRUD */}
        {activeTab === 'os' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setOsList((prev) => [
                  ...prev.filter((o) => o.slug !== osForm.slug),
                  { ...osForm, id: Date.now() }
                ]);
                notify(`OS ${osForm.name} disimpan ke katalog`);
              }}
              className="lg:col-span-4 bg-[#111113] border border-[#232329] rounded-md p-4 space-y-3"
            >
              <h2 className="text-xs font-mono uppercase text-zinc-300">Add / Edit OS Template</h2>
              <input
                type="text"
                required
                placeholder="Slug (almalinux-9)"
                value={osForm.slug}
                onChange={(e) => setOsForm({ ...osForm, slug: e.target.value })}
                className="w-full bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
              />
              <input
                type="text"
                required
                placeholder="OS Name (AlmaLinux 9 Cloud)"
                value={osForm.name}
                onChange={(e) => setOsForm({ ...osForm, name: e.target.value })}
                className="w-full bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  required
                  placeholder="Template VMID (9003)"
                  value={osForm.template_vmid}
                  onChange={(e) => setOsForm({ ...osForm, template_vmid: Number(e.target.value) })}
                  className="bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                />
                <input
                  type="text"
                  required
                  placeholder="Default User"
                  value={osForm.default_user}
                  onChange={(e) => setOsForm({ ...osForm, default_user: e.target.value })}
                  className="bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-zinc-100 text-zinc-950 font-medium text-xs py-2 rounded"
              >
                Save OS Template
              </button>
            </form>

            <div className="lg:col-span-8 bg-[#111113] border border-[#232329] rounded-md p-4 space-y-2.5">
              <h3 className="text-xs font-mono uppercase text-zinc-400">Available OS Templates</h3>
              {osList.map((os) => (
                <div
                  key={os.slug}
                  className="flex items-center justify-between p-3 rounded border border-[#27272a] bg-[#09090b] text-xs font-mono"
                >
                  <div>
                    <div className="font-semibold text-zinc-100">
                      {os.name} (VMID #{os.template_vmid})
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      slug: {os.slug} · default user: {os.default_user} · min disk: {os.min_disk_gb}GB
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setOsForm(os)}
                      className="px-2.5 py-1 rounded border border-[#27272a] hover:border-zinc-500 text-[11px]"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setOsList((prev) => prev.filter((item) => item.slug !== os.slug))}
                      className="p-1 text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: APP CATALOG & BASH SCRIPTS CRUD */}
        {activeTab === 'apps' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setAppList((prev) => [
                  ...prev.filter((a) => a.slug !== appForm.slug),
                  { ...appForm, id: Date.now() }
                ]);
                notify(`App ${appForm.name} disimpan ke katalog`);
              }}
              className="lg:col-span-5 bg-[#111113] border border-[#232329] rounded-md p-4 space-y-3"
            >
              <h2 className="text-xs font-mono uppercase text-zinc-300">
                Add / Edit App Catalog & Initial Bash Script
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Slug (wireguard-vpn)"
                  value={appForm.slug}
                  onChange={(e) => setAppForm({ ...appForm, slug: e.target.value })}
                  className="bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                />
                <input
                  type="text"
                  required
                  placeholder="App Name"
                  value={appForm.name}
                  onChange={(e) => setAppForm({ ...appForm, name: e.target.value })}
                  className="bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Category (ISP / Network)"
                  value={appForm.category}
                  onChange={(e) => setAppForm({ ...appForm, category: e.target.value })}
                  className="bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                />
                <input
                  type="text"
                  placeholder="Ports (80,443)"
                  value={appForm.default_ports}
                  onChange={(e) => setAppForm({ ...appForm, default_ports: e.target.value })}
                  className="bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">
                  Initial Deploy Script (Cloud-Init runcmd — 1 baris per perintah)
                </label>
                <textarea
                  rows={6}
                  required
                  placeholder="apt-get update && apt-get install -y nginx&#10;systemctl enable --now nginx"
                  value={appForm.runcmd_script}
                  onChange={(e) => setAppForm({ ...appForm, runcmd_script: e.target.value })}
                  className="w-full bg-[#09090b] border border-[#27272a] rounded p-2.5 text-xs font-mono"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-zinc-100 text-zinc-950 font-medium text-xs py-2 rounded"
              >
                Save App Recipe
              </button>
            </form>

            <div className="lg:col-span-7 bg-[#111113] border border-[#232329] rounded-md p-4 space-y-3">
              <h3 className="text-xs font-mono uppercase text-zinc-400">
                Turnkey App Recipes (`runcmd`)
              </h3>
              {appList.map((a) => (
                <div
                  key={a.slug}
                  className="p-3 rounded border border-[#27272a] bg-[#09090b] space-y-2 text-xs font-mono"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-zinc-100">{a.name}</span>
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                        {a.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setAppForm(a)}
                        className="px-2.5 py-1 rounded border border-[#27272a] hover:border-zinc-500 text-[11px]"
                      >
                        Edit Script
                      </button>
                      <button
                        onClick={() => setAppList((prev) => prev.filter((item) => item.slug !== a.slug))}
                        className="p-1 text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <pre className="bg-[#111113] border border-[#232329] rounded p-2 text-[11px] text-zinc-400 overflow-x-auto">
                    {a.runcmd_script}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}