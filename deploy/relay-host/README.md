# Relay Host portable Linux VM assets

These files are shipped with the same npm version as Relay Host:

- `portable-manifest.json` binds the Relay npm version, signed Cell digest,
  minimum Ubuntu substrate, tool versions, checksums, and filesystem paths.
- `cloud-init.yaml.tmpl` is rendered by `relay-host-playbook`; do not paste the
  raw template into a provider console.
- `bootstrap.sh` prepares exact public artifacts but deliberately does not start
  a public Relay service or accept licenses, tokens, model keys, or recovery
  secrets.

From an installed package, run:

```bash
relay-host-playbook render \
  --ssh-public-key-file ~/.ssh/id_ed25519.pub \
  --hostname relay-host \
  --output relay-host-cloud-init.yaml
```

Treat the rendered file as public metadata. Continue with
`docs/relay-host-linux-vm.md` only after the provider reports cloud-init has
finished and the bootstrap receipt verifies as `prepared`.
