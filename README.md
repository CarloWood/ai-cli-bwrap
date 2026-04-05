# codex-bwrap

This is a personal project, not necessarily intended to be used by others.

Starts the Opencode CLI or OpenAI Codex CLI inside a bubblewrap container with full permissions,
but limited severely by normal Linux access controls (network namespace `nscodex`
limiting all internet access to [white-listed domains](netns/nft-nscodex.rules), using `bwrap` to only give
read-access to what is required (e.g. not the users HOME directory, or `/etc`),
and only give write access to required directories (workspace, gitache).

Replace `codex` and `opencode` with the bash functions defined in [`env.codex`](env.codex),
and have that load the main script [`codex.run`](codex.run).

Usage:

```
codex|opencode [planner|coder|bash <command>|shell|resume <session-id>]
```

Without a command line parameter the CLI is started as `coder` and opens the
last used Session ID for that mode.

* bash <command> : run <command> in a bash shell inside the codex container.
* shell : start an interactive shell inside the opencode/codex container.
* resume <session-id> : resume a previous Session ID.
* coder/planner : enter, or continue last coder/planner mode.

Any non- shell or bash mode also starts [sockettapd](https://github.com/CarloWood/codex-sockettapd) listening on `$PLANROOT/$REPOBASE.sock`.
For that to work you need the `cw_exec_socket_tap` branch that is part of the `master` branch of my [codex fork](https://github.com/CarloWood/openai-codex),
or the [`session_id.js`](xdg-root/config/opencode/plugin/session_id.js) plugin for opencode.

The project also requires [remountd](https://github.com/CarloWood/remountd), a systemd service,
to be installed and enabled. This allows for switching between a read-only and read-write
mounted workspace directory (not relying on good behavior by the A.I.).

The [`codex.run`](codex.run) script uses a lot of environment variables that are part
of my normal build system (all values are relative to the host system).

In order to control the environment, you are recommended to use [cdeh](https://carlowood.github.io/howto/cdeh.html).

For example, while working on the openai-codex project itself,
the following environment variables (not an exhaustive list) are set:
```
WORKSPACE_ROOT=/home/carlo/projects/github/codex
REPOBASE=openai-codex.git

# run 'project_environment' here

BUILDDIR=/home/carlo/projects/github/codex/openai-codex.git/codex-rs/target/debug
CODEX_DIRECTORY=codex-rs
CODEX_EXTRA_WRITABLE_ROOTS=([0]="/opt/ext4/nvme2/codex/.cargo" [1]="/opt/ext4/nvme2/codex/.rustup")

# Already set prior.
CCACHE_DIR=/opt/ccache
GITACHE_ROOT=/opt/gitache

# Set by 'project_environment'
CODEX_HOME=/home/carlo/.codex
HOME_CODEX=/opt/ext4/nvme2/codex
REPOROOT=/home/carlo/projects/github/codex/openai-codex.git
PLANROOT=/home/carlo/projects/github/codex/openai-codex-AAP
```

# cdeh environment

I can't list every environment file I typically use, but here are the two files
that I directly sourced when working on the codex project, in order to
help you if you want to make a chance to understand what is going on:


For the `~/projects/github/codex` project, the environment files are: (pe = print environment):
```
daniel:~/projects/github/codex>pe
/home/carlo/projects/github/codex/codex-bwrap/env.source
/home/carlo/projects/github/codex/env.source
/home/carlo/projects/github/env.source
/home/carlo/projects/env.source
```

First [`/home/carlo/projects/env.source`](env.projects) is loaded that has been added to this project
for convenience, note how that loads [`env.codex`](env.codex) that is also part of this project.
Then `/home/carlo/projects/github/env.source` is loaded (not relevant here), next `/home/carlo/projects/github/codex/env.source`
is loaded that sets up the environment for `openai-codex.git` (see above) and finally
[`/home/carlo/projects/github/codex/codex-bwrap/env.source`](env.source) is loaded that is also part of this project,
that sets the environment for this project instead (`codex-bwrap`).
