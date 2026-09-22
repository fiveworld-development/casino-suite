// Publishes the live demo: builds, then pushes dist/ to the gh-pages branch (GitHub Pages serves it).
// Usage: npm run deploy
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const run = (cmd, cwd = '.') => execSync(cmd, { cwd, stdio: 'inherit' });
const remote = execSync('git remote get-url origin').toString().trim();

run('npm test');
run('npm run build');
fs.writeFileSync('dist/.nojekyll', ''); // serve files as they are, no Jekyll processing
fs.rmSync('dist/.git', { recursive: true, force: true });
run('git init -q -b gh-pages', 'dist');
run('git add -A', 'dist');
run('git -c core.autocrlf=false commit -q -m "Deploy demo"', 'dist');
run(`git push -q -f ${remote} gh-pages`, 'dist');
fs.rmSync('dist/.git', { recursive: true, force: true });
console.log('\nDeployed – live in about a minute: https://fiveworld-development.github.io/casino-suite/');
