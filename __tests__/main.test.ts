/**
 * Unit tests for the action's fail-open behavior, src/main.ts
 */

import * as core from '@actions/core'
import { run } from '../src/main'

jest.mock('@actions/github', () => ({
  context: {
    repo: { owner: 'acme', repo: 'app' },
    payload: { pull_request: { number: 123 } },
    sha: 'deadbeef',
    ref: 'refs/heads/feature',
    workflow: 'CI',
    job: 'optimize_ci',
    runId: 1,
    eventName: 'pull_request'
  }
}))

describe('run', () => {
  let setOutputMock: jest.SpyInstance
  let setFailedMock: jest.SpyInstance
  let warningMock: jest.SpyInstance

  beforeEach(() => {
    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      switch (name) {
        case 'graphite_token':
          return 'graphite-token'
        case 'endpoint':
          return 'https://api.graphite.dev'
        case 'timeout':
          return '30'
        case 'pr_number':
          return ''
        default:
          return ''
      }
    })
    setOutputMock = jest.spyOn(core, 'setOutput').mockImplementation()
    setFailedMock = jest.spyOn(core, 'setFailed').mockImplementation()
    warningMock = jest.spyOn(core, 'warning').mockImplementation()
    jest.spyOn(core, 'info').mockImplementation()
  })

  it('fails open (skip=false) without failing the job when the request throws', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'))

    await run()

    expect(setFailedMock).not.toHaveBeenCalled()
    expect(warningMock).toHaveBeenCalled()
    expect(setOutputMock).toHaveBeenCalledWith('skip', false)
  })

  it('fails open (skip=false) when the response body cannot be parsed', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected end of JSON input')
      }
    } as unknown as Response)

    await run()

    expect(setFailedMock).not.toHaveBeenCalled()
    expect(setOutputMock).toHaveBeenCalledWith('skip', false)
  })

  it('respects the optimizer decision on a successful response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      status: 200,
      json: async () => ({ skip: true, reason: 'no relevant changes' })
    } as unknown as Response)

    await run()

    expect(setFailedMock).not.toHaveBeenCalled()
    expect(setOutputMock).toHaveBeenCalledWith('skip', true)
  })
})
