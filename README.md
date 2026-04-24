# ai-cli-bwrap

This is a personal project, not necessarily intended to be used by others.

Starts the Opencode CLI or OpenAI Codex CLI inside a bubblewrap container with full permissions,
but limited severely by normal Linux access controls (network namespace `nscodex`
limiting all internet access to [white-listed domains](netns/nft-nscodex.rules), using `bwrap` to only give
read-access to what is required (e.g. not the users HOME directory, or `/etc`),
and only give write access to required directories (workspace, gitache).

Replace `codex` and `opencode` with the bash functions defined in [`env.ai-cli`](env.ai-cli),
and have that load the main script [`ai-cli.run`](ai-cli.run).

Usage:

```
codex|opencode [planner|coder|bash <command>|shell|resume <session-id>]
```

Without a command line parameter the CLI opens the last used Session ID.

* bash <command> : run <command> in a bash shell inside the bwrap container.
* shell : start an interactive shell inside the bwrap container.
* resume <session-id> : resume a previous Session ID.
* analyst/planner/coder : enter, or continue last analyst/planner/coder mode.

Any non- shell or bash mode also starts [sockettapd](https://github.com/CarloWood/codex-sockettapd) listening on `$PLANROOT/$REPOBASE.sock`.
For that to work you need the `cw_exec_socket_tap` branch that is part of the `master` branch of my [codex fork](https://github.com/CarloWood/openai-codex),
or the [`AAP_support.js`](xdg-home/config/opencode/plugin/AAP_support.js) plugin for opencode.

The project also requires [remountd](https://github.com/CarloWood/remountd), a systemd service,
to be installed and enabled. This allows for switching between a read-only and read-write
mounted workspace directory (not relying on good behavior by the A.I.).

The [`ai-cli.run`](ai-cli.run) script uses a lot of environment variables that are part
of my normal build system (all values are relative to the host system).

In order to control the environment, you are recommended to use [cdeh](https://carlowood.github.io/howto/cdeh.html).

For example, while working on the opencode project,
the following environment variables (not an exhaustive list) are set:
```
WORKSPACE_ROOT=/home/carlo/projects/github/ai-cli/opencode
REPOBASE=opencode

# run 'project_environment' here

BUILDDIR=/home/carlo/projects/github/ai-cli/opencode/build
AICLI_DIRECTORY=

# Already set prior.
CCACHE_DIR=/opt/ccache
GITACHE_ROOT=/opt/gitache

# Set by 'project_environment'
CODEX_HOME=/home/carlo/.codex
HOME_AICLI=/opt/ext4/nvme2/codex
REPOROOT=/home/carlo/projects/github/ai-cli/opencode/opencode
PLANROOT=/home/carlo/projects/github/ai-cli/opencode/opencode-AAP
```

# cdeh environment

## The environment files in this repository

* [`env.source`](env.source) : environment file for the "project" `ai-cli-bwrap` itself.
* [`env.projects`](env.projects) : environment file linked to from `~/projects/env.source`; the environment of *all* projects on my PC.
* [`env.ai-cli`](env.ai-cli) : the `ai-cli` environment for the host, sourced by `env.projects` if the current environment is the host environment. Allows the user to start `opencode`.
* [`ai-cli.run`](ai-cli.run) : sourced by the `ai_cli` function defined in `env.ai-cli`. Does all the hard work required to start the requested AI CLI.
* [`dot-bash_profile`](dot-bash_profile) : file bind-mounted at `~/.bash_profile` in the bwrap container.

## Use case

I can't list every environment file I typically use, but here are the two files,
that I directly sourced when working on the ai-cli-bwrap project, in order to
help you if you want to make a chance to understand what is going on:

For the `~/projects/github/ai-cli/ai-cli-bwrap` project, the environment files are: (pe = print environment (files)):
```
daniel:~/projects/github/ai-cli/ai-cli-bwrap>pe
/home/carlo/projects/github/ai-cli/ai-cli-bwrap/env.source
/home/carlo/projects/github/ai-cli/env.source
/home/carlo/projects/github/env.source
/home/carlo/projects/env.source
```

First [`/home/carlo/projects/env.source`](env.projects) is loaded that has been added to this project
for convenience, note how that loads [`env.ai-cli`](env.ai-cli) that is also part of this project.
Then `/home/carlo/projects/github/env.source` is loaded (not relevant here), next `/home/carlo/projects/github/ai-cli/env.source`
is loaded that sets up the environment for `openai-codex.git` (currently) and finally
[`/home/carlo/projects/github/ai-cli/ai-cli-bwrap/env.source`](env.source) is loaded that is also part of this project,
that sets the environment for this project instead (`ai-cli-bwrap`).
