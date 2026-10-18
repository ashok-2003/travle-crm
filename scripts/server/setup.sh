#!/usr/bin/env bash
# Makes a fresh Ubuntu 24.04 server on Oracle Cloud ready for the product (docs/runbook.md). Safe to run again. It
# sets up:
# - security updates that install themselves (rebooting at 03:30 India time when one needs it), and SSH keys only;
# - the server's own firewall opened for 80 and 443 beside SSH (Oracle's images refuse everything else);
# - Docker from Docker's own repository, with rotated logs;
# - huge pages for Postgres's shared buffers, and a little swap for builds;
# - the nightly backup's timer.
# As root, from the server's checkout (scripts/server/release.sh makes it):
#   sudo /srv/travel-crm/app/scripts/server/setup.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
[ "$(id -u)" = 0 ] || {
  echo "Run it as root (sudo)." >&2
  exit 1
}
export DEBIAN_FRONTEND=noninteractive

echo "Packages and security updates"
# iptables-persistent keeps the firewall's rules file as it is, rather than asking to save the live rules.
echo "iptables-persistent iptables-persistent/autosave_v4 boolean false" | debconf-set-selections
echo "iptables-persistent iptables-persistent/autosave_v6 boolean false" | debconf-set-selections
apt-get update -q
apt-get upgrade -y -q
apt-get install -y -q ca-certificates curl git age unattended-upgrades iptables-persistent
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
# The server keeps UTC: 22:00 UTC is 03:30 in India, after the 01:30 backup and before the day starts.
cat >/etc/apt/apt.conf.d/52travel-crm-upgrades <<'EOF'
// When a security update needs a reboot, it happens at 03:30 India time (scripts/server/setup.sh).
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "22:00";
EOF
timedatectl set-timezone Etc/UTC

echo "SSH: keys only, never root"
cat >/etc/ssh/sshd_config.d/10-travel-crm.conf <<'EOF'
# Keys only, and no root (scripts/server/setup.sh). The first value sshd reads wins, hence the 10- in the name.
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
sshd -t
systemctl reload ssh

echo "The firewall: 80 and 443 beside SSH"
# Oracle's Ubuntu images accept SSH and reject every other new connection. Each rule goes after SSH's in the saved
# rules, and into the live ones before the rejection, without reloading them (that would drop Docker's own rules).
rules=/etc/iptables/rules.v4
ssh_rule="-A INPUT -p tcp -m state --state NEW -m tcp --dport 22 -j ACCEPT"
grep -q -x -- "$ssh_rule" "$rules" || {
  echo "Can't find SSH's rule in $rules: open 80 and 443 by hand" >&2
  exit 1
}
for port in 443 80; do
  rule="-A INPUT -p tcp -m state --state NEW -m tcp --dport $port -j ACCEPT"
  grep -q -x -- "$rule" "$rules" || sed -i "\|^$ssh_rule\$|a $rule" "$rules"
  if ! iptables -C INPUT -p tcp -m state --state NEW -m tcp --dport "$port" -j ACCEPT 2>/dev/null; then
    reject="$(iptables -L INPUT --line-numbers -n | awk '$2 == "REJECT" { print $1; exit }')"
    iptables -I INPUT "${reject:-1}" -p tcp -m state --state NEW -m tcp --dport "$port" -j ACCEPT
  fi
done

echo "Docker, from Docker's repository"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  # shellcheck source=/dev/null
  codename="$(. /etc/os-release && echo "$VERSION_CODENAME")"
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc]" \
    "https://download.docker.com/linux/ubuntu $codename stable" >/etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
# Every container's log rotated: five files of 10 MB each at most.
daemon='{ "log-driver": "local", "log-opts": { "max-size": "10m", "max-file": "5" } }'
if [ "$(cat /etc/docker/daemon.json 2>/dev/null || true)" != "$daemon" ]; then
  echo "$daemon" >/etc/docker/daemon.json
  systemctl restart docker
fi
systemctl enable --quiet docker

echo "Huge pages for Postgres, and swap"
# 3.4 GB of huge pages: Postgres's 3 GB of shared buffers and the rest of its shared memory (docker-compose.server.yml).
page_kb="$(awk '/^Hugepagesize:/ { print $2 }' /proc/meminfo)"
echo "vm.nr_hugepages = $(((3400 * 1024 + page_kb - 1) / page_kb))" >/etc/sysctl.d/60-travel-crm.conf
echo "vm.swappiness = 10" >>/etc/sysctl.d/60-travel-crm.conf
sysctl --quiet --system
if ! swapon --show=NAME --noheadings | grep -q -x /swapfile; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo "/swapfile none swap sw 0 0" >>/etc/fstab
fi

echo "The nightly backup's timer"
install -m 0644 scripts/server/systemd/travel-crm-backup.service scripts/server/systemd/travel-crm-backup.timer \
  /etc/systemd/system/
systemctl daemon-reload
systemctl enable --quiet --now travel-crm-backup.timer

echo "The server is ready. Huge pages reserved: $(awk '/^HugePages_Total:/ { print $2 }' /proc/meminfo)"
