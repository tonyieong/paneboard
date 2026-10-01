#!/bin/sh
# Linux counterpart of build.ps1: builds, signs and verifies the private APK.
# Run setup-linux-toolchain.sh once first. Tools, caches, signing keys and
# output all stay inside this workspace's output/ directory.
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
probe="$repo_root/android/probe"
toolchain="$repo_root/output/node_modules/android-toolchain"
sdk_tools="$repo_root/output/node_modules/android-sdk-tools"
build_root="$repo_root/output/node_modules/android-probe-build"
jdk="$sdk_tools/jdk-17"
build_tools="$sdk_tools/sdk/build-tools/35.0.0"
android_jar="$sdk_tools/sdk/platforms/android-35/android.jar"
go="$toolchain/go/bin/go"

for file in "$jdk/bin/javac" "$android_jar" "$build_tools/aapt2" "$build_tools/zipalign" "$go"; do
  [ -e "$file" ] || { echo "Missing build tool: $file (run android/probe/setup-linux-toolchain.sh)" >&2; exit 1; }
done

rm -rf "$build_root"
for folder in res/drawable res/xml assets classes dex native/lib/arm64-v8a tmp; do
  mkdir -p "$build_root/$folder"
done

export GOPATH="$toolchain/gopath"
export GOCACHE="$toolchain/cache"
export GOTOOLCHAIN=local
export GOTMPDIR="$build_root/tmp"
export TMPDIR="$GOTMPDIR"
export GOOS=android GOARCH=arm64 CGO_ENABLED=0

notices="$build_root/assets/THIRD-PARTY-NOTICES.txt"
(
  cd "$probe/core"
  "$go" build -p=4 -buildmode=pie -ldflags='-checklinkname=0 -s -w' -o "$build_root/native/lib/arm64-v8a/libpaneboardcore.so" .
  # Bundle direct and transitive modules actually compiled for Android.
  modules=$("$go" list -deps -f '{{with .Module}}{{.Path}}|{{.Version}}|{{.Dir}}{{end}}' . | sed '/^$/d' | sort -u)
  {
    echo 'Paneboard Android - third-party notices'
    cat "$toolchain/go/LICENSE"
    echo "$modules" | while IFS='|' read -r path version dir; do
      [ "$path" = paneboard.local/android-probe ] && continue
      [ -n "$dir" ] || continue
      licenses=$(find "$dir" -maxdepth 1 -type f | grep -E '/(LICENSE|LICENCE|COPYING|NOTICE)(\.[^/]*)?$' | sort || true)
      [ -n "$licenses" ] || { echo "Review missing license for $path" >&2; exit 1; }
      printf '\n%s %s\n' "$path" "$version"
      echo "$licenses" | while read -r license; do cat "$license"; echo; done
    done
  } > "$notices"
)

cp "$repo_root/public/icon-192.png" "$build_root/res/drawable/icon.png"
cp "$probe/network-security-config.xml" "$build_root/res/xml/network_security_config.xml"
"$jdk/bin/javac" -encoding UTF-8 -source 8 -target 8 -nowarn -Xlint:-options -classpath "$android_jar" -d "$build_root/classes" "$probe/MainActivity.java"
"$jdk/bin/jar" cf "$build_root/classes.jar" -C "$build_root/classes" .
"$jdk/bin/java" -cp "$build_tools/lib/d8.jar" com.android.tools.r8.D8 --min-api 28 --lib "$android_jar" --output "$build_root/dex" "$build_root/classes.jar"
"$build_tools/aapt2" compile --dir "$build_root/res" -o "$build_root/resources.zip"
"$build_tools/aapt2" link -o "$build_root/unsigned.apk" --manifest "$probe/AndroidManifest.xml" -I "$android_jar" -A "$build_root/assets" "$build_root/resources.zip"
"$jdk/bin/jar" uf "$build_root/unsigned.apk" -C "$build_root/dex" classes.dex -C "$build_root/native" lib
"$build_tools/zipalign" -f -p 4 "$build_root/unsigned.apk" "$build_root/aligned.apk"

# Only this account may read the private signing material.
signing_root="$repo_root/output/android-signing"
mkdir -p "$signing_root"
chmod 700 "$signing_root"
keystore="$signing_root/paneboard-release.p12"
password_file="$signing_root/keystore-password"
if [ -e "$keystore" ] && [ ! -e "$password_file" ]; then
  echo 'Release key password missing; restore signing backup, never replace the key' >&2; exit 1
fi
if [ -e "$password_file" ] && [ ! -e "$keystore" ]; then
  echo 'Release key missing; restore signing backup, never silently generate a replacement' >&2; exit 1
fi
if [ ! -e "$password_file" ]; then
  (umask 077; head -c 32 /dev/urandom | base64 | tr -d '\n' > "$password_file")
fi
PANEBOARD_SIGNING_PASSWORD=$(cat "$password_file")
export PANEBOARD_SIGNING_PASSWORD
trap 'unset PANEBOARD_SIGNING_PASSWORD' EXIT
if [ ! -e "$keystore" ]; then
  (umask 077; "$jdk/bin/keytool" -genkeypair -keystore "$keystore" -storetype PKCS12 \
    -storepass:env PANEBOARD_SIGNING_PASSWORD -keypass:env PANEBOARD_SIGNING_PASSWORD \
    -alias paneboard -dname 'CN=Paneboard Private' -keyalg RSA -keysize 3072 -validity 10000)
fi

apk="$build_root/Paneboard-1.0.apk"
signer="$build_tools/lib/apksigner.jar"
lineage="$signing_root/signing-lineage"
set -- -jar "$signer" sign --ks "$keystore" --ks-key-alias paneboard \
  --ks-pass env:PANEBOARD_SIGNING_PASSWORD --key-pass env:PANEBOARD_SIGNING_PASSWORD \
  --v1-signing-enabled false --v2-signing-enabled false --v3-signing-enabled true --v4-signing-enabled false \
  --debuggable-apk-permitted false --out "$apk"
if [ -e "$lineage" ]; then
  set -- "$@" --lineage "$lineage" --rotation-min-sdk-version 28
fi
"$jdk/bin/java" "$@" "$build_root/aligned.apk"
"$jdk/bin/java" -jar "$signer" verify --verbose --print-certs "$apk"

delivery="$repo_root/output/android-release"
mkdir -p "$delivery"
cp "$apk" "$delivery/Paneboard-1.0.apk"
(cd "$delivery" && sha256sum Paneboard-1.0.apk > Paneboard-1.0.apk.sha256)
echo "Built and verified: $apk"
