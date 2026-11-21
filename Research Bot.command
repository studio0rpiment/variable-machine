#!/bin/bash
# The research bot, on its own: double-click this file to start Variable Machine
# opened straight into the research bot's walkthrough, with nothing else on the page.
#
# It is Variable Machine.command, started for one project: the same checks, the
# same install the first time, the same app. Everything the research bot makes stays
# in the workspace folder beside this file, on this computer.
# To stop it, close this Terminal window (or press ctrl-C).

HERE="$(cd "$(dirname "$0")" && pwd)"
export VARIABLE_MACHINE_PROJECT=research
exec "$HERE/Variable Machine.command"
