import * as core from '@actions/core'
import * as github from '@actions/github'
import * as pkg from '../package.json'

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const graphite_token: string = core.getInput('graphite_token')
    const endpoint: string = core.getInput('endpoint')
    const timeout: string = core.getInput('timeout')
    const pr_number_input: string = core.getInput('pr_number')

    await requestWorkflow({
      graphite_token,
      endpoint,
      timeout,
      pr_number_input
    })
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}

async function requestWorkflow({
  graphite_token,
  endpoint,
  timeout,
  pr_number_input
}: {
  graphite_token: string
  endpoint: string
  timeout: string
  pr_number_input: string
}): Promise<void> {
  const {
    repo: { owner, repo }
  } = github.context

  // Use pr_number input if provided, otherwise fall back to pull_request context
  const prNumber = pr_number_input
    ? parseInt(pr_number_input, 10)
    : github.context.payload.pull_request?.number

  const result = await fetch(`${endpoint}/api/v1/ci/optimizer`, {
    method: 'POST',
    body: JSON.stringify({
      token: graphite_token,
      caller: {
        name: pkg.name,
        version: pkg.version
      },
      context: {
        kind: 'GITHUB_ACTIONS',
        repository: {
          owner,
          name: repo
        },
        pr: prNumber,
        sha: github.context.sha,
        ref: github.context.ref,
        head_ref: process.env.GITHUB_HEAD_REF,
        run: {
          workflow: github.context.workflow,
          job: github.context.job,
          run: github.context.runId
        }
      }
    }),
    signal: AbortSignal.timeout(parseInt(timeout, 10) * 1000)
  })

  if (result.status === 401) {
    core.warning('Invalid authentication. Skipping Graphite checks.')
    core.setOutput('skip', false)
    return
  }

  if (result.status === 402) {
    core.warning(
      'Your Graphite plan does not support the CI Optimizer. Please upgrade your plan to use this feature.'
    )
    core.setOutput('skip', false)
    return
  }

  if (github.context.eventName === 'workflow_dispatch') {
    core.info('Workflow dispatch event detected. Skipping Graphite checks.')
    core.setOutput('skip', false)
    return
  }

  if (result.status !== 200) {
    const body = JSON.stringify({
      token: graphite_token,
      caller: {
        name: pkg.name,
        version: pkg.version
      },
      context: {
        kind: 'GITHUB_ACTIONS',
        repository: {
          owner,
          name: repo
        },
        pr: prNumber,
        sha: github.context.sha,
        ref: github.context.ref,
        head_ref: process.env.GITHUB_HEAD_REF,
        run: {
          workflow: github.context.workflow,
          job: github.context.job,
          run: github.context.runId
        }
      }
    })
    core.warning(`Request body: ${body}`)
    core.warning(`Response status: ${result.status}`)
    core.warning(`${owner}/${repo}/${prNumber}`)
    core.warning(
      'Response returned a non-200 status. Skipping Graphite checks.'
    )
    core.setOutput('skip', false)
    return
  }

  try {
    const body: {
      skip: boolean
      reason: string
    } = await result.json()

    core.setOutput('skip', body.skip)
    core.info(body.reason)
  } catch {
    core.warning('Failed to parse response body. Skipping Graphite checks.')
    return
  }
}
