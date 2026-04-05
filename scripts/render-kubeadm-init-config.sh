#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "Usage: $0 <control-plane-private-ip> <control-plane-public-ip> [cluster-name]" >&2
  exit 1
fi

CONTROL_PLANE_PRIVATE_IP="$1"
CONTROL_PLANE_PUBLIC_IP="$2"
CLUSTER_NAME="${3:-aditi-stays-dev-cluster}"

cat <<YAML
apiVersion: kubeadm.k8s.io/v1beta4
kind: InitConfiguration
localAPIEndpoint:
  advertiseAddress: ${CONTROL_PLANE_PRIVATE_IP}
nodeRegistration:
  kubeletExtraArgs:
    cloud-provider: external
---
apiVersion: kubeadm.k8s.io/v1beta4
kind: ClusterConfiguration
clusterName: ${CLUSTER_NAME}
networking:
  podSubnet: 192.168.0.0/16
apiServer:
  certSANs:
    - ${CONTROL_PLANE_PUBLIC_IP}
  extraArgs:
    cloud-provider: external
controllerManager:
  extraArgs:
    cloud-provider: external
YAML
