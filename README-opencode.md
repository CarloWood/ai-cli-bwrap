# Starting opencode

Opencode is started by running the bash function `opencode` defined in [env.codex](env.codex#L43).

That function simply calls the bash function `codex`, also defined in [env.codex](env.codex#L9),
passing `--opencode` as first argument. The effect of that is that inside the `codex` bash function
the variable `run_opencode` is set to `1`, which in turn causes an `CODEX_RUN_OPENCODE=1` before
sourcing [codex.run](codex.run).

In other words, running `opencode [<args>]` is equivalent to running either `codex --opencode [<args>]`
as well as running `CODEX_RUN_OPENCODE=1 codex <args>`.

# Environment

The (bash) environment is controlled through [cdeh](https://carlowood.github.io/howto/cdeh.html).

## Environment files involved

### `~/.bashrc`

This file defines `TOPPROJECT` and initializes `cdeh` by ending with
```
CDEH_ROOT=/opt/cdeh
source $CDEH_ROOT/env.bashrc
```

### `~/projects/env.source`

While not *really* a part of OpenCode support, my (all) projects specific environment
plays an important role enough to warrant that I added it to this project, if only for
documentation purposes. You can find my `~/projects/env.source` here as [env.projects](env.projects).

This file sets the environment variables [`CCACHE_DIR`](#CCACHE_DIR_host) and [`GITACHE_ROOT`](#GITACHE_ROOT_host) that are mentioned below
and, among others, defines the bash functions `project_environment`, `setup_aap`, `abbreviate_path`,
and `set_compiler_env`.

Furthermore it sources [env.codex](env.codex), see [below](#envcodex).

Note that the function `project_environment` sources `$PROJECTDIR/env.compiler`.

### `env.codex`

[This file](env.codex) sets the environment variables [`HOME_CODEX`](#HOME_CODEX_host) and [`CODEX_HOME`](#CODEX_HOME_host)
as well as defines the bash functions `codex` and `opencode`.

Note that the function `codex` sources [`$HOME/projects/github/codex/codex.run`](codex.run)
that starts a bwrap container with optionally the Codex CLI or the OpenCode CLI running inside it.

### `codex.run`

[This file](codex.run) does the heavy lifting of starting required daemons, the network namespace
and a bubblewrapped environment inside of which we then run `bash`, the Codex CLI (`/usr/bin/codex`)
or the OpenCode CLI (either from the opencode repository if that is the current project, or otherwise
as `~/.local/bin/opencode` where it is installed).

Then each time `bash` is run to execute a command that sources `$HOME_CODEX/.bash_profile`.

### `~/.bash_profile`

[This file](dot-bash_profile) is read by bash running inside the container. It is bind-mounted
at `~/.bash_profile` by `codex.run`.

Unlike the hosts `~/.bashrc` this files also sets project specific environment variables.
It sets [`PROJECTDIR`](#PROJECTDIR_container), [`HOME_CODEX`](#HOME_CODEX_container), [`CODEX_INSIDE_ENVIRONMENT`](#CODEX_INSIDE_ENVIRONMENT_container),
[`TOPPROJECT`](#TOPPROJECT_container), [`REPOROOT`](#REPOROOT_container), [`PATH`](#PATH_container), [`XDG_CACHE_HOME`](#XDG_CACHE_HOME_container) and
[`OPENCODE_DISABLE_CHANNEL_DB`](#OPENCODE_DISABLE_CHANNEL_DB_container) and sets up the CDEH environment for inside the container, see [below](#bashprofile).

## Environment variables

The following environment variables are used by the script [codex.run](codex.run):

### Defined on the host (before running `codex.run`)

* <a id="PROJECTDIR_host">`PROJECTDIR`</a> : the topmost directory associated with the current project. This directory is common to all other paths related to a project, like for example the repository directory and the build directory.
* <a id="REPOBASE_host">`REPOBASE`</a> : the path to the project repository relative to `$PROJECTDIR` (see `REPOROOT`).
* <a id="REPOROOT_host">`REPOROOT`</a> : equal to `$PROJECTDIR/$REPOBASE`; the repository root of the current project.
* <a id="CCACHE_DIR_host">`CCACHE_DIR`</a> : this path is mounted as tmpfs in the container so that if `CCACHE_DIR` is set to the same value inside the container then it can be used.
* <a id="HOME_CODEX_host">`HOME_CODEX`</a> : equal to `/opt/ext4/nvme2/codex`, the HOME directory inside the container.
* <a id="CDEH_TMP_host">`CDEH_TMP`</a> : defined by [cdeh](https://carlowood.github.io/howto/cdeh.html). `$CDEH_TMP/env.base` is expected to contain the environment associated with the `/` (thus free of any project specific definitions) and will be copied to `$HOME_CODEX/cdeh/env.base` so that `cdeh` also works inside the container resulting in the same environment as on the host.
* <a id="GITACHE_ROOT_host">`GITACHE_ROOT`</a> : will be bind-mounted read-write inside the container, sharing the [gitache](https://github.com/CarloWood/gitache) root with the host.
* <a id="CODEX_EXTRA_WRITABLE_ROOTS_host">`CODEX_EXTRA_WRITABLE_ROOTS`</a> : a bash array with additional paths - not used by opencode.
* <a id="CODEX_RUN_OPENCODE_host">`CODEX_RUN_OPENCODE`</a> : defined to `1` (set by the `codex` bash function, see [above](#Starting-opencode)).
* <a id="CODEX_HOME_host">`CODEX_HOME`</a> : set to `$HOME/.codex` (not used by `codex.run` directly). This directory is bind-mounted at `~/.codex` in the container.

### Defined in the container (visible by `opencode`)

The following environment variables are changed and exported (if not already) by the `codex.run` script:

* <a id="HOME_container">`HOME`</a> : set to `HOME_CODEX` (`/opt/ext4/nvme2/codex`, see above).
* <a id="CODEX_MODE_container">`CODEX_MODE`</a> : one of `"shell"`, `"bash"`, `"analyst"`, `"planner"` or `"coder"`.
* <a id="CODEX_RUN_OPENCODE_container">`CODEX_RUN_OPENCODE`</a> : defined to `1` (set by the `codex` bash function, see above).

<a a id="bashprofile"></a>
The following environment variables are set by `~/.bash_profile` inside the container:

* <a id="PROJECTDIR_container>`PROJECTDIR`</a> : set to `$HOME/workspace` and therefore equal to `/opt/ext4/nvme2/codex/workspace`, the directory that is the bind-mount location for the host directory `$PROJECTDIR`.
* <a id="HOME_CODEX_container">`HOME_CODEX`</a> : set to `$HOME` and therefore equal to `/opt/ext4/nvme2/codex` - the same value that it had on the host.
* <a id="CDEH_ROOT_container">`CDEH_ROOT`</a> : set to `$HOME/cdeh`, aka `/opt/ext4/nvme2/codex/cdeh`, the containers own [cdeh](https://carlowood.github.io/howto/cdeh.html) root. This directory contains the `env.bashrc` and `do_prompt` files copied by [`codex.run`](codex.run). Also the host file `$CDEH_TMP/env.base` (see above) was copied there by `codex.run`. Finally it contains all `env.source` files that normally are printed by `pe` copied here as `env.host$nr`. All this is just needed to rebuild the environment inside the container (that is being documented here).
* <a id="CODEX_INSIDE_ENVIRONMENT_container">`CODEX_INSIDE_ENVIRONMENT`</a> : set to `1`.
* <a id="TOPPROJECT_container">`TOPPROJECT`</a> : set to `$PROJECTDIR`. Note that `env.compiler` is sourced from `$PROJECTDIR/env.compiler` these days; so not sure if changing `TOPPROJECT` makes sense here.
* <a id="REPOROOT_container">`REPOROOT`</a> : set to `$PROJECTDIR/$REPOBASE`, and thus equal to the container directory that is the bind-mount location for the host `$REPOROOT`.
* <a id="PATH_container">`PATH`</a> : set to `"$HOME/.local/bin:/usr/bin:/usr/bin/site_perl:/usr/bin/vendor_perl:/usr/bin/core_perl"`.
* <a id="XDG_CACHE_HOME_container">`XDG_CACHE_HOME`</a> : set to `"$PROJECTDIR/cache/xdg"`.
* <a id="OPENCODE_DISABLE_CHANNEL_DB_container">`OPENCODE_DISABLE_CHANNEL_DB`</a> : set to `1`.

Environment variables that are changed unless `$CODEX_MODE` is `"shell"`.

* `PROMPT_COMMAND` : unset - this is not an interactive environment so [cdeh](https://carlowood.github.io/howto/cdeh.html) is turned off.
* `HISTFILE` : set to `"$CDEH_HISTROOT$PROJECTDIR/history"`.
* `PS1` set to `"codex-\w>"`.

## Debugging the bash functions

In order to get file names and line numbers of commands that being executed by bash, run
```
export PS4='+ ${BASH_SOURCE}:${LINENO}:${FUNCNAME[0]}: '
set -x
```
before running the script.

If the output is too noisy, you can also write this to a file.
For example,
```
exec 9>trace.log
export BASH_XTRACEFD=9
export PS4='+ ${BASH_SOURCE}:${LINENO}:${FUNCNAME[0]}: '
set -x
codex --opencode planner
set +x
```

or temporarily add
```
PS4='+ ${BASH_SOURCE}:${LINENO}:${FUNCNAME[0]}: '
set -x
```
to the top of a script under test.
