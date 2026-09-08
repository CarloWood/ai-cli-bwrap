# nsaicli network namespace configuration

These files are a backup of `/etc/conf.d/netns/*nsaicli*`

Required for the `sudo systemctl start netns-nft@nsaicli.service` line in codex.run to work.
To stop all services and take down nsaicli cleanly, run:
`sudo systemctl stop netns-lo@nsaicli netns-veth@nsaicli`.

See https://github.com/CarloWood/systemd-netns which is required too.

[sbin/nft_add_allowed_IPs.sh](sbin/nft_add_allowed_IPs.sh) is a backup of /usr/local/sbin/nft_add_allowed_IPs.sh
