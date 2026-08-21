import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { basename, extname, join } from 'path'
import type { DetectionCandidate, DetectionResult } from '../shared/types'

const PACKAGE_MANAGERS: ReadonlyArray<readonly [string, string]> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
  ['npm-shrinkwrap.json', 'npm']
]

const SCRIPT_PRIORITY = [
  'dev',
  'start',
  'serve',
  'preview',
  'web',
  'docs:dev',
  'docs:start',
  'build'
]

function firstExisting(dir: string, names: string[]): string | null {
  for (const n of names) {
    if (existsSync(join(dir, n))) return join(dir, n)
  }
  return null
}

function readFirst(dir: string, names: string[]): string | null {
  const p = firstExisting(dir, names)
  if (!p) return null
  try {
    return readFileSync(p, 'utf8').slice(0, 20000)
  } catch {
    return null
  }
}

export function detectProject(dir: string): DetectionResult {
  const candidates: DetectionCandidate[] = []
  const notes: string[] = []
  if (!dir || !existsSync(dir) || !statSync(dir).isDirectory()) {
    return { type: '无效目录', candidates: [], notes: ['目录不存在或不可访问'] }
  }

  const pkgPath = firstExisting(dir, ['package.json'])
  if (pkgPath) {
    let pkg: {
      scripts?: Record<string, string>
      main?: string
      bin?: string | Record<string, string>
    } | null = null
    try {
      pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    } catch {
      notes.push('package.json 解析失败')
    }
    const pmEntry = PACKAGE_MANAGERS.find(([f]) => existsSync(join(dir, f)))
    const pm = pmEntry ? pmEntry[1] : 'npm'
    const scripts = pkg?.scripts ?? {}
    for (const name of SCRIPT_PRIORITY) {
      if (scripts[name]) {
        candidates.push({
          command: `${pm} run ${name}`,
          kind: 'service',
          label: `${pm} ${name}`,
          port: guessPortFromScript(scripts[name])
        })
      }
    }
    const mainFile = pkg?.main
    if (mainFile && existsSync(join(dir, mainFile))) {
      candidates.push({ command: `node ${mainFile}`, kind: 'service', label: `node ${mainFile}` })
    }
    const hexoConf = firstExisting(dir, ['_config.yml', '_config.yaml'])
    if (
      hexoConf &&
      /hexo/.test(JSON.stringify(pkg ?? {})) &&
      existsSync(join(dir, 'node_modules', 'hexo'))
    ) {
      candidates.unshift({
        command: 'npx hexo server',
        kind: 'service',
        label: 'Hexo 服务',
        port: 4000
      })
    }
    if (!candidates.length && pkg) {
      notes.push('未找到常用启动脚本（dev/start/serve/preview），可手动填写命令')
    }
  }

  for (const f of ['hugo.toml', 'hugo.yaml', 'hugo.json', 'config.toml']) {
    if (existsSync(join(dir, f))) {
      candidates.push({ command: 'hugo server', kind: 'service', label: 'Hugo 服务', port: 1313 })
      break
    }
  }

  if (existsSync(join(dir, 'manage.py'))) {
    candidates.unshift({
      command: 'python manage.py runserver',
      kind: 'service',
      label: 'Django 服务',
      port: 8000
    })
  }

  const fastapiFile = firstExisting(dir, ['main.py', 'app.py'])
  if (fastapiFile) {
    const content = readFirst(dir, [basename(fastapiFile)]) ?? ''
    if (/fastapi|uvicorn/i.test(content)) {
      const mod = basename(fastapiFile).replace(/\.py$/, '')
      candidates.unshift({
        command: `uvicorn ${mod}:app --reload`,
        kind: 'service',
        label: 'FastAPI 服务',
        port: 8000
      })
    } else if (/flask/i.test(content)) {
      candidates.unshift({
        command: `python ${basename(fastapiFile)}`,
        kind: 'service',
        label: 'Flask 服务',
        port: 5000
      })
    }
  }

  if (existsSync(join(dir, 'go.mod'))) {
    candidates.push({ command: 'go run .', kind: 'service', label: 'Go 服务' })
  }
  if (existsSync(join(dir, 'Cargo.toml'))) {
    candidates.push({ command: 'cargo run', kind: 'service', label: 'Rust 服务' })
  }

  // Deno 项目
  const denoConf = firstExisting(dir, ['deno.json', 'deno.jsonc'])
  if (denoConf) {
    const denoContent = readFirst(dir, [basename(denoConf)]) ?? ''
    if (/"tasks"\s*:/i.test(denoContent) && /"dev"\s*:/i.test(denoContent)) {
      candidates.push({ command: 'deno task dev', kind: 'service', label: 'Deno (task dev)' })
    } else {
      candidates.push({
        command: 'deno run --allow-net main.ts',
        kind: 'service',
        label: 'Deno 服务'
      })
    }
  }

  // .NET 项目（匹配任意 *.csproj / *.sln / Program.cs）
  let hasDotnet = existsSync(join(dir, 'Program.cs'))
  if (!hasDotnet) {
    try {
      hasDotnet = readdirSync(dir).some((f) => /\.(csproj|sln)$/i.test(f))
    } catch {
      /* 忽略 */
    }
  }
  if (hasDotnet) {
    candidates.push({ command: 'dotnet run', kind: 'service', label: '.NET 服务' })
  }

  const pomPath = firstExisting(dir, ['pom.xml'])
  if (pomPath) {
    const pom = readFirst(dir, ['pom.xml']) ?? ''
    const mvnwWin = existsSync(join(dir, 'mvnw.cmd'))
    const mvnwSh = existsSync(join(dir, 'mvnw'))
    const mvn = process.platform === 'win32' && mvnwWin ? '.\\mvnw.cmd' : mvnwSh ? './mvnw' : 'mvn'
    if (/spring-boot/i.test(pom)) {
      candidates.unshift({
        command: `${mvn} spring-boot:run`,
        kind: 'service',
        label: 'Maven · Spring Boot',
        port: 8080
      })
    } else {
      candidates.push({ command: `${mvn} compile`, kind: 'task', label: 'Maven 编译' })
    }
  }

  const gradlePath = firstExisting(dir, ['build.gradle', 'build.gradle.kts'])
  if (gradlePath) {
    const build = readFirst(dir, [basename(gradlePath)]) ?? ''
    const gradlewWin = existsSync(join(dir, 'gradlew.bat'))
    const gradlewSh = existsSync(join(dir, 'gradlew'))
    const gradle =
      process.platform === 'win32' && gradlewWin
        ? '.\\gradlew.bat'
        : gradlewSh
          ? './gradlew'
          : 'gradle'
    if (/spring-boot|org\.springframework\.boot/i.test(build)) {
      candidates.unshift({
        command: `${gradle} bootRun`,
        kind: 'service',
        label: 'Gradle · Spring Boot',
        port: 8080
      })
    } else if (/id\s+['"]application['"]/i.test(build)) {
      candidates.push({ command: `${gradle} run`, kind: 'service', label: 'Gradle · application' })
    } else {
      candidates.push({ command: `${gradle} build`, kind: 'task', label: 'Gradle 构建' })
    }
  }

  const pyScripts = ['main.py', 'app.py', 'server.py', 'run.py'].filter((f) =>
    existsSync(join(dir, f))
  )
  for (const f of pyScripts) {
    if (!candidates.some((c) => c.command.includes(f))) {
      candidates.push({ command: `python ${f}`, kind: 'task', label: `python ${f}` })
    }
  }

  const mongodCfg = firstExisting(dir, ['mongod.cfg', 'mongod.conf', 'mongod.yml'])
  if (mongodCfg) {
    candidates.push({
      command: `mongod --config ${basename(mongodCfg)}`,
      kind: 'service',
      label: 'MongoDB 服务'
    })
  } else if (existsSync(join(dir, 'data', 'db'))) {
    candidates.push({ command: 'mongod --dbpath data\\db', kind: 'service', label: 'MongoDB 服务' })
  }

  if (existsSync(join(dir, 'index.html')) || existsSync(join(dir, 'public', 'index.html'))) {
    candidates.push({
      command: 'npx serve . -l 8080',
      kind: 'service',
      label: '静态站点 (serve)',
      port: 8080
    })
    candidates.push({
      command: 'python -m http.server 8080',
      kind: 'service',
      label: '静态站点 (python)',
      port: 8080
    })
  }

  const scripts = ['dev.sh', 'start.sh', 'run.sh', 'deploy.sh']
  for (const f of scripts) {
    if (existsSync(join(dir, f))) {
      candidates.push({ command: `bash ${f}`, kind: 'task', label: `bash ${f}` })
    }
  }

  if (!candidates.length && !pkgPath) {
    notes.push('未识别到项目类型，可手动填写命令或选择脚本')
  }

  const type = resolveTypeLabel(candidates)
  return { type, candidates: candidates.slice(0, 8), notes }
}

function guessPortFromScript(script: string): number | undefined {
  const m = script.match(/(?:--port|-p|PORT)\s*[=:]?\s*(\d{2,5})/i)
  if (m) return Number(m[1])
  const s = script.toLowerCase()
  if (/\bvite\b/.test(s)) return s.includes('preview') ? 4173 : 5173
  if (/\bnext\b/.test(s)) return 3000
  if (/\bnuxt\b/.test(s)) return 3000
  if (/\bnest\b/.test(s)) return 3000
  if (/\bastro\b/.test(s)) return 4321
  if (/\bwebpack\b/.test(s) && /\bserve|dev-server|devserver\b/.test(s)) return 8080
  if (/\bng\s+serve\b/.test(s)) return 4200
  return undefined
}

function resolveTypeLabel(candidates: DetectionCandidate[]): string {
  if (!candidates.length) return '未知'
  const labels = candidates.map((c) => c.label)
  if (labels.some((l) => l.includes('Hexo'))) return 'Hexo'
  if (labels.some((l) => l.includes('Hugo'))) return 'Hugo'
  if (labels.some((l) => l.includes('Django'))) return 'Django'
  if (labels.some((l) => l.includes('FastAPI'))) return 'FastAPI'
  if (labels.some((l) => l.includes('Flask'))) return 'Flask'
  if (labels.some((l) => /^pnpm /.test(l))) return 'Node (pnpm)'
  if (labels.some((l) => /^yarn /.test(l))) return 'Node (yarn)'
  if (labels.some((l) => /^bun /.test(l))) return 'Node (bun)'
  if (labels.some((l) => /^npm /.test(l))) return 'Node (npm)'
  if (labels.some((l) => l.startsWith('node '))) return 'Node 脚本'
  if (labels.some((l) => l.startsWith('go '))) return 'Go'
  if (labels.some((l) => l.startsWith('cargo '))) return 'Rust'
  if (labels.some((l) => /^deno/i.test(l))) return 'Deno'
  if (labels.some((l) => /^\.net|^dotnet/i.test(l))) return '.NET'
  if (labels.some((l) => l.includes('Spring Boot'))) return 'Java (Spring Boot)'
  if (labels.some((l) => l.includes('静态'))) return '静态站点'
  return '脚本'
}

export function scriptCommand(scriptPath: string): DetectionResult {
  if (!scriptPath || !existsSync(scriptPath)) {
    return { type: '无效脚本', candidates: [], notes: ['脚本不存在或不可访问'] }
  }
  const ext = extname(scriptPath).toLowerCase()
  const map: Record<string, { command: string; label: string; kind: 'task' | 'service' }> = {
    '.js': { command: `node "${scriptPath}"`, label: `node ${basename(scriptPath)}`, kind: 'task' },
    '.mjs': {
      command: `node "${scriptPath}"`,
      label: `node ${basename(scriptPath)}`,
      kind: 'task'
    },
    '.cjs': {
      command: `node "${scriptPath}"`,
      label: `node ${basename(scriptPath)}`,
      kind: 'task'
    },
    '.ts': {
      command: `npx tsx "${scriptPath}"`,
      label: `tsx ${basename(scriptPath)}`,
      kind: 'task'
    },
    '.py': {
      command: `python "${scriptPath}"`,
      label: `python ${basename(scriptPath)}`,
      kind: 'task'
    },
    '.sh': { command: `bash "${scriptPath}"`, label: `bash ${basename(scriptPath)}`, kind: 'task' },
    '.ps1': {
      command: `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`,
      label: `powershell ${basename(scriptPath)}`,
      kind: 'task'
    },
    '.bat': { command: `"${scriptPath}"`, label: basename(scriptPath), kind: 'task' },
    '.cmd': { command: `"${scriptPath}"`, label: basename(scriptPath), kind: 'task' }
  }
  const hit = map[ext]
  if (!hit) {
    return {
      type: '未知脚本类型',
      candidates: [{ command: `"${scriptPath}"`, kind: 'task', label: basename(scriptPath) }],
      notes: [`未识别的扩展名 ${ext}，将直接执行`]
    }
  }
  return { type: ext.slice(1).toUpperCase() + ' 脚本', candidates: [hit] }
}

export function guessCwd(cmdline: string | null): string | undefined {
  if (!cmdline) return undefined
  const tokens = cmdline.match(/"[^"]*"|\S+/g) ?? []
  for (const t of tokens) {
    const cleaned = t.replace(/^"|"$/g, '')
    if (!/^[A-Za-z]:[\\/]/.test(cleaned)) continue
    try {
      if (statSync(cleaned).isFile() && !/\.(exe|cmd|bat|com)$/i.test(cleaned)) {
        return cleaned
          .slice(0, Math.max(cleaned.lastIndexOf('\\'), cleaned.lastIndexOf('/')))
          .replace(/\\+$/, '')
      }
    } catch {
      /* 忽略 */
    }
  }
  return undefined
}
