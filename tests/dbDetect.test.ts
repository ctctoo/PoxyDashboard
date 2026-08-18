import { describe, expect, it } from 'vitest'
import { buildDbCommands, detectServiceName, guessDbVersion, identifyDb } from '../src/main/dbDetect'

describe('identifyDb', () => {
  it('识别 Redis 手动进程', () => {
    const db = identifyDb({ name: 'redis-server.exe', cmdline: 'redis-server --port 6380', binaryPath: 'C:\\Redis\\redis-server.exe', port: 6380 })
    expect(db?.kind).toBe('redis')
    expect(db?.label).toBe('Redis')
    expect(db?.service).toBeUndefined()
    expect(db?.start).toContain('redis-server')
    expect(db?.stop).toContain('redis-cli -h 127.0.0.1 -p 6380 shutdown nosave')
  })

  it('识别 MySQL 服务进程并从安装路径推断服务名与版本', () => {
    const cmd = '"C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqld.exe" --defaults-file="C:\\ProgramData\\MySQL\\MySQL Server 8.0\\my.ini" MySQL80'
    const db = identifyDb({ name: 'mysqld.exe', cmdline: cmd, binaryPath: 'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqld.exe', port: 3306 })
    expect(db?.kind).toBe('mysql')
    expect(db?.version).toBe('8.0')
    expect(db?.service).toBe('MySQL80')
    expect(db?.start).toContain('sc start')
    expect(db?.stop).toContain('sc stop')
  })

  it('识别 MariaDB 进程', () => {
    const db = identifyDb({ name: 'mariadbd.exe', cmdline: 'mariadbd --console', binaryPath: 'C:\\Program Files\\MariaDB 11.4\\bin\\mariadbd.exe', port: 3307 })
    expect(db?.kind).toBe('mariadb')
    expect(db?.service).toBe('MariaDB')
  })

  it('识别 PostgreSQL 服务进程', () => {
    const cmd = '"C:\\Program Files\\PostgreSQL\\16\\bin\\pg_ctl.exe" runservice -N "postgresql-x64-16" -D "C:\\Program Files\\PostgreSQL\\16\\data"'
    const db = identifyDb({ name: 'postgres.exe', cmdline: cmd, binaryPath: 'C:\\Program Files\\PostgreSQL\\16\\bin\\postgres.exe', port: 5432 })
    expect(db?.kind).toBe('postgres')
    expect(db?.version).toBe('16')
    expect(db?.service).toBe('postgresql-x64-16')
  })

  it('识别 SQL Server 服务进程', () => {
    const db = identifyDb({ name: 'sqlservr.exe', cmdline: '"C:\\Program Files\\Microsoft SQL Server\\MSSQL16.MSSQLSERVER\\MSSQL\\Binn\\sqlservr.exe" -MSSQLSERVER', binaryPath: 'C:\\Program Files\\Microsoft SQL Server\\MSSQL16.MSSQLSERVER\\MSSQL\\Binn\\sqlservr.exe', port: 1433 })
    expect(db?.kind).toBe('sqlserver')
    expect(db?.service).toBe('MSSQLSERVER')
  })

  it('识别 MongoDB 手动进程并生成优雅关闭命令', () => {
    const db = identifyDb({ name: 'mongod.exe', cmdline: 'mongod --dbpath D:\\data\\db --port 27017', binaryPath: 'C:\\Program Files\\MongoDB\\Server\\6.0\\bin\\mongod.exe', port: 27017 })
    expect(db?.kind).toBe('mongodb')
    expect(db?.version).toBe('6.0')
    expect(db?.service).toBeUndefined()
    expect(db?.stop).toContain('--shutdown --dbpath D:\\data\\db')
  })

  it('识别 Elasticsearch（java 进程 + 命令行匹配）', () => {
    const db = identifyDb({ name: 'java.exe', cmdline: 'java -Xms1g -Xmx1g -Des.path.home=C:\\elasticsearch-8.11.0 org.elasticsearch.bootstrap.Elasticsearch', binaryPath: 'C:\\Program Files\\Java\\jdk-17\\bin\\java.exe', port: 9200 })
    expect(db?.kind).toBe('elasticsearch')
    expect(db?.version).toBe('8.11.0')
  })

  it('非数据库进程返回 undefined', () => {
    expect(identifyDb({ name: 'node.exe', cmdline: 'node server.js', port: 3000 })).toBeUndefined()
    expect(identifyDb({ name: 'code.exe', cmdline: 'code .' })).toBeUndefined()
    expect(identifyDb({ name: 'java.exe', cmdline: 'java -jar app.jar' })).toBeUndefined()
  })

  it('普通 java 进程不会被误判为数据库', () => {
    const db = identifyDb({ name: 'java.exe', cmdline: 'java -jar myapp.jar', binaryPath: 'C:\\Program Files\\Java\\jdk-17\\bin\\java.exe', port: 8080 })
    expect(db).toBeUndefined()
  })
})

describe('buildDbCommands', () => {
  it('无服务时 Redis 使用 redis-cli 优雅关闭', () => {
    const cmds = buildDbCommands({ kind: 'redis', cmdline: 'redis-server --port 6379', port: 6379 })
    expect(cmds.stop).toContain('redis-cli -h 127.0.0.1 -p 6379 shutdown nosave')
    expect(cmds.start).toContain('redis-server --port 6379')
  })

  it('PostgreSQL 手动进程由数据目录生成 pg_ctl stop', () => {
    const cmds = buildDbCommands({ kind: 'postgres', cmdline: 'postgres -D "C:\\pg\\data" -p 5432', binaryPath: 'C:\\tools\\pg\\bin\\postgres.exe' })
    expect(cmds.stop?.toLowerCase()).toContain('pg_ctl')
    expect(cmds.stop).toContain('stop -D C:\\pg\\data')
    expect(cmds.start).toContain('postgres -D "C:\\pg\\data"')
  })
})

describe('detectServiceName', () => {
  it('从命令行末尾提取 MySQL 服务名', () => {
    expect(detectServiceName('mysql', '"C:\\mysql\\mysqld.exe" --defaults-file=my.ini MySQL80')).toBe('MySQL80')
  })

  it('从安装路径推断 MySQL 版本服务名', () => {
    expect(detectServiceName('mysql', 'mysqld --console', 'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqld.exe')).toBe('MySQL84')
  })

  it('从 -N 参数提取 PostgreSQL 服务名', () => {
    expect(detectServiceName('postgres', 'pg_ctl runservice -N "postgresql-x64-16" -D data')).toBe('postgresql-x64-16')
  })

  it('SQL Server 实例名映射为 MSSQL$ 服务', () => {
    expect(detectServiceName('sqlserver', 'sqlservr -SSQLEXPRESS')).toBe('MSSQL$SQLEXPRESS')
  })

  it('Oracle 提取 SID 并映射服务名', () => {
    expect(detectServiceName('oracle', 'oracle ORACLE_HOME=... ORACLE_SID=ORCL')).toBe('OracleServiceORCL')
  })
})

describe('guessDbVersion', () => {
  it('从路径提取 MySQL / PostgreSQL / MongoDB 版本', () => {
    expect(guessDbVersion('mysql', 'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqld.exe')).toBe('8.0')
    expect(guessDbVersion('postgres', 'C:\\Program Files\\PostgreSQL\\15\\bin\\postgres.exe')).toBe('15')
    expect(guessDbVersion('mongodb', 'C:\\Program Files\\MongoDB\\Server\\7.0\\bin\\mongod.exe')).toBe('7.0')
    expect(guessDbVersion('redis', 'C:\\Program Files\\Redis\\redis-7.2\\redis-server.exe')).toBe('7.2')
  })
})
