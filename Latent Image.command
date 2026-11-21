#!/bin/bash
# The latent image, on its own: double-click this file to start Variable Machine
# opened straight into the latent image's walkthrough, with nothing else on the page.
#
# It is Variable Machine.command, started for one project: the same checks, the
# same install the first time, the same app. Everything the latent image makes stays
# in the workspace folder beside this file, on this computer.
# To stop it, close this Terminal window (or press ctrl-C).

HERE="$(cd "$(dirname "$0")" && pwd)"
export VARIABLE_MACHINE_PROJECT=latent
exec "$HERE/Variable Machine.command"
