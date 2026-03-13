# nscodex network namespace configuration

These files are a backup of /etc/conf.d/netns/*codex*

Required for the `sudo systemctl start netns-nft@nscodex.service` line in codex.run to work.
To stop all services and take down nscodex cleanly, run:
`sudo systemctl stop netns-lo@nscodex netns-veth@nscodex`.

See https://github.com/CarloWood/systemd-netns which is required too.
