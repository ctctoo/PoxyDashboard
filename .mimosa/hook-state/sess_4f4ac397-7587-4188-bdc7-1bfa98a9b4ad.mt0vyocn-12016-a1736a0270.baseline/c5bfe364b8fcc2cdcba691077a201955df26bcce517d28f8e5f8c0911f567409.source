import type { DbInfo, DbKind } from '../shared/types'

export interface DbDetectInput {
  name: string
  cmdline: string
  binaryPath?: string | null
  port?: number
}

export interface DbCommandInput {
  kind: DbKind
  cmdline: string
  binaryPath?: string | null
  port?: number
}

interface DbMatcher {
  kind: DbKind
  label: string
  icon: string
  exe: RegExp
  /** 可选：仅在命令行命中时才归类（用于 java 等通用进程名） */
  cmd?: RegExp
}

const DB_MATCHERS: DbMatcher[] = [
  { kind: 'mariadb', label: 'MariaDB', icon: '🐬', exe: /^mariadbd$/ },
  { kind: 'mysql', label: 'MySQL', icon: '🐬', exe: /^(mysqld|mysqld-nt|mysqld-debug)$/ },
  { kind: 'postgres', label: 'PostgreSQL', icon: '🐘', exe: /^(postgres|postmaster)$/ },
  { kind: 'sqlserver', label: 'SQL Server', icon: '🗄️', exe: /^sqlservr$/ },
  { kind: 'oracle', label: 'Oracle', icon: '🔶', exe: /^(oracle|ora_smon_\w+|lsnrctl|tnslsnr)$/, cmd: /oracle/i },
  { kind: 'redis', label: 'Redis', icon: '🧡', exe: /^redis-server$/ },
  { kind: 'mongodb', label: 'MongoDB', icon: '🍃', exe: /^(mongod|mongos)$/ },
  { kind: 'clickhouse', label: 'ClickHouse', icon: '🟢', exe: /^(clickhouse-server|clickhouse)$/, cmd: /clickhouse(-server)?/i },
  { kind: 'elasticsearch', label: 'Elasticsearch', icon: '🟠', exe: /^(elasticsearch|java)$/, cmd: /elasticsearch/i },
  { kind: 'kafka', label: 'Kafka', icon: '🐘', exe: /^(kafka|java)$/, cmd: /kafka\.Kafka|kafka-server-start/i },
  { kind: 'memcached', label: 'Memcached', icon: '💾', exe: /^memcached$/ },
  { kind: 'neo4j', label: 'Neo4j', icon: '💎', exe: /^(neo4j|java)$/, cmd: /neo4j/i },
  { kind: 'cassandra', label: 'Cassandra', icon: '🐘', exe: /^(cassandra|java)$/, cmd: /CassandraDaemon/i },
  { kind: 'influxdb', label: 'InfluxDB', icon: '📈', exe: /^influxd$/ }
]

/** 识别扫描进程是否为常见数据库，返回数据库信息（含启停控制命令） */
export function identifyDb(input: DbDetectInput): DbInfo | undefined {
  const name = (input.name || '').toLowerCase().replace(/\.exe$/, '')
  for (const m of DB_MATCHERS) {
    if (!m.exe.test(name)) continue
    if (m.cmd && !m.cmd.test(input.cmdline || '')) continue
    const cmds = buildDbCommands({ kind: m.kind, cmdline: input.cmdline, binaryPath: input.binaryPath, port: input.port })
    return {
      kind: m.kind,
      label: m.label,
      icon: m.icon,
      version: guessDbVersion(m.kind, input.binaryPath ?? undefined, input.cmdline),
      service: cmds.service,
      start: cmds.start,
      stop: cmds.stop
    }
  }
  return undefined
}

export interface DbCommands {
  service?: string
  start?: string
  stop?: string
}

/**
 * 为数据库生成控制命令：
 * - 优先识别 Windows 服务名，通过 `sc start/stop` 控制；
 * - 非服务进程使用原命令行启动，并用原生优雅关闭命令停止。
 */
export function buildDbCommands(input: DbCommandInput): DbCommands {
  const { kind, cmdline, binaryPath, port } = input
  const service = detectServiceName(kind, cmdline, binaryPath ?? undefined)
  if (service) {
    return { service, start: `sc start "${service}"`, stop: `sc stop "${service}"` }
  }
  const binDir = binaryPath ? binaryPath.replace(/[\\/][^\\/]+$/, '') : undefined
  let stop: string | undefined
  switch (kind) {
    case 'redis':
      stop = port && port > 0 ? `redis-cli -h 127.0.0.1 -p ${port} shutdown nosave` : 'redis-cli shutdown nosave'
      break
    case 'mongodb': {
      const dbpath = /--dbpath\s+"?([^"\s]+)"?/i.exec(cmdline)
      const exe = binDir ? quoteWin(`${binDir}\\mongod.exe`) : 'mongod'
      stop = dbpath ? `${exe} --shutdown --dbpath ${quoteWin(dbpath[1])}` : `${exe} --shutdown`
      break
    }
    case 'postgres': {
      const datadir = /(?:-D|--pgdata)\s+"?([^"\s]+)"?/i.exec(cmdline)
      const exe = binDir ? quoteWin(`${binDir}\\pg_ctl.exe`) : 'pg_ctl'
      stop = datadir ? `${exe} stop -D ${quoteWin(datadir[1])}` : undefined
      break
    }
    default:
      stop = undefined
  }
  return { service, start: cmdline || undefined, stop }
}

function quoteWin(s: string): string {
  return /[\s"]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s
}

/** 从命令行 / 安装路径推断 Windows 服务名，供 sc start/stop 使用 */
export function detectServiceName(kind: DbKind, cmdline: string, binaryPath?: string): string | undefined {
  const c = cmdline
  const path = (binaryPath ?? '').replace(/\\/g, '/').toLowerCase()
  switch (kind) {
    case 'mysql':
    case 'mariadb': {
      // 服务进程命令行最后一个参数常为服务名，如 "... mysqld.exe ... MySQL80"
      const m = /(?:^|["\s])(MySQL\d*|MariaDB)\s*$/i.exec(c.trim())
      if (m) return m[1]
      const ver = /mysql server (\d+\.\d+)/i.exec(path)
      if (ver) {
        const [major, minor] = ver[1].split('.').map((x) => x.trim())
        return `MySQL${major}${minor}`
      }
      if (/mariadb/i.test(path)) return 'MariaDB'
      return undefined
    }
    case 'postgres': {
      const m = /-N\s+"?([^"\s]+)"?/.exec(c)
      if (m) return m[1]
      const ver = /postgresql[\\/](\d+)/i.exec(path)
      if (ver) return `postgresql-x64-${ver[1]}`
      return undefined
    }
    case 'mongodb': {
      const m = /--serviceName\s+"?([^"\s]+)"?/.exec(c)
      if (m) return m[1]
      if (/\s--service\b/.test(c)) return 'MongoDB'
      return undefined
    }
    case 'sqlserver': {
      const m = /-S\s*"?([^"\s]+)"?/.exec(c)
      if (m) {
        const inst = m[1]
        return inst === '.' || inst === '(local)' ? 'MSSQLSERVER' : `MSSQL$${inst}`
      }
      if (/-MSSQLSERVER/.test(c)) return 'MSSQLSERVER'
      return /mssql[\\/]\d+/i.test(path) ? 'MSSQLSERVER' : undefined
    }
    case 'oracle': {
      const m = /ORACLE_SID[=:]\s*"?([A-Za-z0-9_$]+)"?/i.exec(c)
      if (m) return `OracleService${m[1]}`
      return undefined
    }
    default:
      return undefined
  }
}

/** 从安装路径 / 命令行提取数据库版本号 */
export function guessDbVersion(kind: DbKind, binaryPath?: string, cmdline?: string): string | undefined {
  const path = (binaryPath ?? '').replace(/\\/g, '/').toLowerCase()
  const cmd = cmdline ?? ''
  switch (kind) {
    case 'mysql':
    case 'mariadb': {
      const m = /mysql server (\d+\.\d+)/i.exec(path) || /mariadb[ -]?(\d+\.\d+)/i.exec(path) || /mariadb server (\d+\.\d+)/i.exec(cmd)
      return m?.[1]
    }
    case 'postgres': {
      const m = /postgresql[\\/](\d+)/i.exec(path)
      return m?.[1]
    }
    case 'mongodb': {
      const m = /mongodb[\\/]server[\\/](\d+\.\d+)/i.exec(path)
      return m?.[1]
    }
    case 'sqlserver': {
      const m = /mssql[\\/](\d+)/i.exec(path)
      return m?.[1]
    }
    case 'redis': {
      const m = /redis-(\d+\.\d+)/i.exec(path)
      return m?.[1]
    }
    case 'elasticsearch': {
      const m = /elasticsearch-(\d+\.\d+\.\d+)/i.exec(path) || /elasticsearch-(\d+\.\d+\.\d+)/i.exec(cmd)
      return m?.[1]
    }
    default:
      return undefined
  }
}
