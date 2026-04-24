#!/usr/bin/env bash
set -euo pipefail

#==============================================================================
# Important environment variables.
#
perl -pe 's/@([A-Z0-9_]+)@/$ENV{$1}/g' <<'EOF_important_environment_variables'
# Important Environment variables

The following environment variables are available:

- PROJECTDIR : equal to @PROJECTDIR@.
- REPOROOT : the repository root (@REPOROOT@).
EOF_important_environment_variables
if [[ $AICLI_MODE == "planner" || $AICLI_MODE == "analyst" ]]; then
  echo "- PLANROOT : the repository root of the plan ($PLANROOT) This is writable, REPOROOT is *read-only*!"
elif [[ -n ${BUILDDIR:-} ]]; then
  echo "- BUILDDIR : the full path to the build directory ($BUILDDIR)."
fi
cat <<'EOF_important_environment_variables'

Use these with priority instead of using a full path, you can always rely on them being correct.

Note: normally you do not even need to use these because using paths relative to the current [working] directory (CWD) are even better.

Directories can unexpectedly change due to switching projects and restarting the CLI.
Therefore avoid using absolute paths, even those that used to work, if the path is somewhere inside $WORKSPACE_ROOT.
THINK and WORK with the above environment variables for all file and directory references.

EOF_important_environment_variables
#==============================================================================

#==============================================================================
# Avoid redundant cd commands.
#
#- First check `$AICLI_DIRECTORY`; if empty then the cwd equals $REPOROOT. Avoid a redundant `cd $REPOROOT`.
if [[ $AICLI_MODE == "planner" ]]; then
  current_working_directory='$PLANROOT'
  priority_paths='$PROJECTDIR or $REPOROOT'
elif [[ -z $AICLI_DIRECTORY ]]; then
  current_working_directory='$REPOROOT'
  priority_paths='$PROJECTDIR or $BUILDDIR'
else
  current_working_directory="\$REPOROOT/$AICLI_DIRECTORY"
  priority_paths='$REPOROOT and $BUILDDIR'
fi
printf -- '- Every command that you execute has as '"'"'current directory'"'"' %s (CWD). Avoid a redundant `cd %s`.\n' "$current_working_directory" "$current_working_directory"
printf -- "- Prefer paths relative to the CWD, otherwise prioritize %s in commands and communication instead of absolute paths.\n" "$priority_paths"
#==============================================================================

#==============================================================================
# Explain where the CLI is allowed to make changes.
#
perl -pe 's/@([A-Z0-9_]+)@/$ENV{$1}/g' <<'EOF_Stay_inside_workspace'

# Stay inside workspace

- Never make any changes outside of the path @PROJECTDIR@ ($PROJECTDIR).
EOF_Stay_inside_workspace
if [[ $AICLI_MODE == "coder" ]]; then
  echo '  Both $REPOROOT and $BUILDDIR are inside PROJECTDIR, so making changes there is ok.'
fi
#==============================================================================

#==============================================================================
# Remarks related to autogen.sh
#
if [[ $AICLI_MODE == "coder" && -f ${REPOROOT}/autogen.sh ]]; then
  echo
  echo "### Configuration Quick Start"
  echo
  if [[ -z $AICLI_DIRECTORY ]]; then
    echo '- Run `./autogen.sh` and follow the configure and build instructions verbatim.'
  else
    echo '- Run `cd $REPOROOT && ./autogen.sh` and follow the configure and build instructions verbatim.'
  fi
cat <<'EOF_autogen_sh'
- If the user says `build the project` he means to run the `cmake --build ...` line ONLY. Do NOT run the `cmake -S $REPOROOT ...` line.
  Otherwise he'll say `configure`. If unsure if the project was already configured at all; just assume it is.
- There is no need to inspect autogen.sh, just configure and build by running what the output of `autogen.sh` tells you.
- If any error occurs during configuration (running `./autogen.sh` or running cmake) then STOP immediately and do NOT try to work around the error.
EOF_autogen_sh
fi
#==============================================================================

#==============================================================================
# About Helper shell functions
#
HAVE_MAKE_FUNCTION="$1"
HAVE_S_FUNCTION="$2"
HAVE_GS_FUNCTION="$3"
S_FUNCTION_USES_PRINT0="$4"

if [[ ${HAVE_MAKE_FUNCTION} == "function" && ${HAVE_S_FUNCTION} == "function" && -f "$CTAGS_FILE" ]]; then
  cat <<'EOF_Helper_shell_functions'

## Helper shell functions

- `findsymbol <symbol> [--kinds=<kinds-list>] [--scope=<scope>] [--subpath=<sub-path>] [--prefix] [--help]`
       --kinds : a comma separated list of kinds: `c|class, s|struct, u|union, f|func|method, m|member|field, v|var|variable, t|typedef|using, g|Enum, e|enum, n|namespace, d|macro|define`
       --subpath : filters on a contiguous subsequence of pathname components in the output location.
       --scope : filters on scopes that begin with given substring.
       --prefix : also match symbols that begin with `<symbol>`.
EOF_Helper_shell_functions
if [[ $AICLI_MODE == "planner" ]]; then
  environment_variables='`REPOROOT`, `PROJECTDIR`'
else
  environment_variables='`REPOROOT`, `BUILDDIR`, `PROJECTDIR`'
fi
printf '  Paths are abbreviated by being either relative to the cwd or the path environment variables (%s).\n' "$environment_variables"
if [[ $AICLI_MODE == "planner" ]]; then
  echo '  `findsymbol` uses "$CTAGS_FILE" that is up-to-date with the "$REPOROOT" project.'
else
  echo '  `findsymbol` uses "$CTAGS_FILE" which can be refreshed by running `make ctags` (only do that if it starts failing).'
fi
cat <<'EOF_Helper_shell_functions'

- Always use `findsymbol` to locate the definition of a class, (member)function, enum etc.
EOF_Helper_shell_functions
if [[ $AICLI_MODE == "coder" ]]; then
  printf '  If findsymbol returns no results and the code was changed in the meantime, run `make ctags` before falling back to `rg` if findsymbol doesn'"'"'t find what you are looking for.'
fi
cat <<'EOF_Helper_shell_functions'
- Use `rg` only if you need to find *every* occurrence including comments, usage, forward declarations etc.

For example, to find all locations where a class, struct or typedef `Vector` is defined in the project, you will use: `findsymbol Vector --kinds=c,s,t`.
The reason for this tool is to limit the generated output; following up with an `rg` command is strongly discouraged, as that would defeat the whole purpose of `findsymbol`.
Note that findsymbol currently does not find concept declarations.
EOF_Helper_shell_functions
fi
#==============================================================================

#==============================================================================
# List useful bash functions.
#
cat <<'EOF_Useful_bash_functions'

# Useful bash functions

The following bash functions are available.

EOF_Useful_bash_functions

if [[ ${HAVE_S_FUNCTION} == "function" ]]; then
  if [[ ${S_FUNCTION_USES_PRINT0:-} == "yes" ]]; then
    GREP_EXAMPLE='s | xargs -0 grep -Hn foobar'
  else
    GREP_EXAMPLE='grep -Hn foobar `s`'
  fi
  cat <<EOF_Useful_bash_function_s
- s               : prints all source files relevant to the project.
                    Can be used in for example: $GREP_EXAMPLE
EOF_Useful_bash_function_s
  if [[ ${HAVE_GS_FUNCTION} == "function" ]]; then
    cat <<'EOF_Useful_bash_function_gs'
- gs <reg.exp>    : Search for whole words in all source files.
                    For example `gs opencode` would NOT find `opencode_foo`,
                    but only variables, functions and occurences in
                    comments that match exactly the whole word `opencode`.
EOF_Useful_bash_function_gs
  fi
fi
if [[ $AICLI_MODE == "coder" ]]; then
  cat <<'EOF_Useful_bash_function_which'
- which <command> : prints the alias, function or executable that will
                    be executed, including the definition of aliases
                    and functions.

# Additional instructions

- Never remove code that is commented out with `#if 0`.
EOF_Useful_bash_function_which
fi
#==============================================================================
