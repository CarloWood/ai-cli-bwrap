# Starting opencode

Opencode is started by running the bash script `opencode` defined in [env.codex](env.codex#L43).

That bash function simply calls the bash function `codex`, also defined in [env.codex](env.codex#L9),
passing `--opencode` as first argument. The effect of that is that inside the `codex` bash function
the variable `run_opencode` is set to `1`, which in turn causes an `export CODEX_RUN_OPENCODE=1`
before sourcing [codex.run](codex.run).

In other words, running `opencode [<args>]` is equivalent to running either `codex --opencode [<args>]`
as well as running `CODEX_RUN_OPENCODE=1 codex <args>`.

# Debugging the bash functions

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
