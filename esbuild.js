const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** Prints friendly build errors instead of a wall of JSON. */
const problemReporter = {
  name: 'problem-reporter',
  setup(build) {
    build.onEnd((result) => {
      for (const err of result.errors) {
        const loc = err.location;
        console.error(
          `✖ ${err.text}` + (loc ? `\n    ${loc.file}:${loc.line}:${loc.column}` : '')
        );
      }
      if (result.errors.length === 0) {
        console.log(`[chewgy] build ok${watch ? ' (watching)' : ''}`);
      }
    });
  },
};

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    target: 'node18',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'silent',
    plugins: [problemReporter],
  });

  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
