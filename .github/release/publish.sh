#!/bin/sh
# Release hook (publish): publishes the packages to npm.
# The shared release workflow runs this file, at a fixed path, when it exists.
set -eu
sh deploy/release/publish.sh
