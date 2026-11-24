/**
 * electron-builder afterPack hook: ad-hoc sign the macOS bundle.
 *
 * Without a Developer ID certificate electron-builder skips signing entirely,
 * leaving only Electron's linker-signed ad-hoc executable. That signature has
 * no `Contents/_CodeSignature/CodeResources`, so the bundle seal is invalid and
 * Gatekeeper reports "GitGlance is damaged and can't be opened" for any
 * quarantined (downloaded) copy instead of the overridable "unidentified
 * developer" prompt.
 *
 * Re-signing the packed bundle ad-hoc completes the seal. It is still
 * untrusted, but no longer looks tampered with. When a real identity is
 * configured electron-builder signs after this hook, so skip and let it work.
 *
 * Hardened runtime (`--options runtime`) is deliberately omitted: it requires a
 * Team ID to load the nested Electron Framework, so an ad-hoc signature plus
 * runtime dies at startup with "mapping process and mapped file have different
 * Team IDs". Runtime only matters for notarization, which needs a Developer ID.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ENTITLEMENTS = path.join('build', 'entitlements.mac.plist');

function hasRealIdentity(env) {
  return Boolean(env.CSC_LINK || env.CSC_NAME || env.CSC_IDENTITY);
}

export async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  if (hasRealIdentity(process.env)) {
    console.log('  • after-pack: Developer ID identity configured, leaving signing to electron-builder');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  const projectDir = context.packager.projectDir;
  const entitlements = path.join(projectDir, ENTITLEMENTS);

  const args = ['--force', '--deep', '--sign', '-'];
  if (fs.existsSync(entitlements)) {
    args.push('--entitlements', entitlements);
  }
  args.push(appPath);

  console.log(`  • after-pack: ad-hoc signing ${path.relative(projectDir, appPath)}`);
  execFileSync('codesign', args, { stdio: 'inherit' });

  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
  console.log('  • after-pack: ad-hoc signature verified');
}
