#!/bin/sh
# Downloads the Android build toolchain for Linux into this workspace, the
# layout android/probe/build.sh expects. Every archive is pinned by SHA-256;
# sdkmanager verifies the SDK packages it installs. Nothing is installed
# system-wide. Running it again skips whatever is already in place.
#
# Installing the SDK packages accepts the Android SDK License Agreement:
# https://developer.android.com/studio/terms
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
toolchain="$repo_root/output/node_modules/android-toolchain"
sdk_tools="$repo_root/output/node_modules/android-sdk-tools"
downloads="$repo_root/output/node_modules/android-downloads"

go_version=1.27.1
go_archive="go$go_version.linux-amd64.tar.gz"
go_sha256=63d339f0da5ab53635a56f2490a7984dfe12dfcff22ad749f63edaf590168445
jdk_archive=OpenJDK17U-jdk_x64_linux_hotspot_17.0.20.1_1.tar.gz
jdk_url="https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.20.1%2B1/$jdk_archive"
jdk_sha256=3808d1d15e3ec6bd5b84057fb5d84c33d8a1536a258146bcea2e603fc726e08e
cmdline_archive=commandlinetools-linux-15859902_latest.zip
cmdline_sha256=4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583

fetch() {
  url=$1 file="$downloads/$2" sum=$3
  if [ ! -f "$file" ] || ! echo "$sum  $file" | sha256sum -c --status; then
    curl -fsSL --retry 3 -o "$file.part" "$url"
    echo "$sum  $file.part" | sha256sum -c --quiet
    mv "$file.part" "$file"
  fi
}

mkdir -p "$toolchain" "$sdk_tools" "$downloads"

if [ ! -x "$toolchain/go/bin/go" ]; then
  fetch "https://go.dev/dl/$go_archive" "$go_archive" "$go_sha256"
  tar -xzf "$downloads/$go_archive" -C "$toolchain"
fi

if [ ! -x "$sdk_tools/jdk-17/bin/javac" ]; then
  fetch "$jdk_url" "$jdk_archive" "$jdk_sha256"
  rm -rf "$sdk_tools/jdk-17" "$sdk_tools/jdk-17.tmp"
  mkdir "$sdk_tools/jdk-17.tmp"
  tar -xzf "$downloads/$jdk_archive" -C "$sdk_tools/jdk-17.tmp" --strip-components=1
  mv "$sdk_tools/jdk-17.tmp" "$sdk_tools/jdk-17"
fi

sdk="$sdk_tools/sdk"
if [ ! -x "$sdk/cmdline-tools/latest/bin/sdkmanager" ]; then
  fetch "https://dl.google.com/android/repository/$cmdline_archive" "$cmdline_archive" "$cmdline_sha256"
  rm -rf "$sdk/cmdline-tools"
  mkdir -p "$sdk/cmdline-tools"
  unzip -q "$downloads/$cmdline_archive" -d "$sdk/cmdline-tools"
  mv "$sdk/cmdline-tools/cmdline-tools" "$sdk/cmdline-tools/latest"
fi

if [ ! -f "$sdk/platforms/android-35/android.jar" ] || [ ! -x "$sdk/build-tools/35.0.0/aapt2" ]; then
  export JAVA_HOME="$sdk_tools/jdk-17"
  yes | "$sdk/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$sdk" --licenses >/dev/null
  "$sdk/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$sdk" "build-tools;35.0.0" "platforms;android-35"
fi

echo "Android toolchain ready under output/node_modules/"
