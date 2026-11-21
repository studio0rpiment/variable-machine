#!/bin/bash
# The dream cards, on their own: double-click this file to start Variable Machine
# opened straight into the dream reading's walkthrough, with the dream reader,
# trained, beside it in the top bar, and nothing else on the page.
#
# The dream reading shows what the installation makes, with a ready-made reader;
# the dream reader, trained, has the student make every part of it.
#
# It is Variable Machine.command, started for two projects: the same checks, the
# same install the first time, the same app. Everything the dream cards make stays
# in the workspace folder beside this file, on this computer.
# To stop it, close this Terminal window (or press ctrl-C).

HERE="$(cd "$(dirname "$0")" && pwd)"
export VARIABLE_MACHINE_PROJECT=dream,dream-trained
exec "$HERE/Variable Machine.command"
