import { describe, expect, it } from 'vitest'
import { parseDockerPortMap, parseDockerPorts, parseDockerPs } from '../src/main/dockerScan'

describe('parseDockerPorts', () => {
  it('提取宿主机监听端口', () => {
    expect(parseDockerPorts('0.0.0.0:8080->8080/tcp')).toEqual([8080])
  })

  it('多端口时仅提取映射到宿主机的端口', () => {
    expect(parseDockerPorts('0.0.0.0:5173->5173/tcp, 3306/tcp')).toEqual([5173])
  })

  it('IPv6 与多绑定端口', () => {
    expect(parseDockerPorts('[::]:8080->8080/tcp, 127.0.0.1:9000->80/tcp')).toEqual([8080, 9000])
  })

  it('无端口映射返回空数组', () => {
    expect(parseDockerPorts('')).toEqual([])
  })
})

describe('parseDockerPs', () => {
  it('解析 docker ps --format {{json .}} 输出行', () => {
    const out = parseDockerPs(
      '{"ID":"abc123","Names":"web","Image":"nginx:latest","Status":"Up 5 minutes","State":"running","Ports":"0.0.0.0:8080->8080/tcp"}\n' +
        '{"ID":"def456","Names":"db","Image":"mysql:8","Status":"Up 2 hours","State":"running","Ports":"3306/tcp"}'
    )
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ id: 'abc123', name: 'web', image: 'nginx:latest' })
    expect(out[1]?.name).toBe('db')
  })

  it('跳过无法解析的行', () => {
    expect(parseDockerPs('not-json\n{"ID":"x","Names":"a","Image":"i","Status":"Up","State":"running","Ports":""}')).toHaveLength(1)
  })
})

describe('parseDockerPortMap', () => {
  it('格式化端口映射文本', () => {
    expect(parseDockerPortMap('0.0.0.0:8080->8080/tcp, 3306/tcp')).toBe('0.0.0.0:8080->8080/tcp, 3306/tcp')
  })

  it('空字符串返回空', () => {
    expect(parseDockerPortMap('')).toBe('')
  })
})
