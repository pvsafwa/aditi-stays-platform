# Monitoring and Alerts

This folder provides baseline alert rules for Prometheus Operator installations.

## Included
- `prometheus-rules.yaml`: Core API and chat service error-rate alerts + funnel health signal.
- `alertmanager-config.yaml`: Alertmanager receiver template (replace webhook URL before apply).

## Apply
```bash
kubectl apply -k infra/monitoring
```

## Notes
- Core API metrics endpoint: `/metrics`
- Chat service metrics endpoint: `/api/metrics`
- Add ServiceMonitors in your cluster so Prometheus scrapes both services.
