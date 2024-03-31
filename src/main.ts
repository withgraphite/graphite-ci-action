import * as core from '@actions/core'
import * as github from '@actions/github'
import * as pkg from '../package.json'

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const github_token: string = core.getInput('github_token')
    const graphite_token: string = core.getInput('graphite_token')
    const endpoint: string = core.getInput('endpoint')
    const timeout: string = core.getInput('timeout')

    await requestAndCancelWorkflow({
      github_token,
      graphite_token,
      endpoint,
      timeout
    })
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}

async function requestAndCancelWorkflow({
  github_token,
  graphite_token,
  endpoint,
  timeout
}: {
  github_token: string
  graphite_token: string
  endpoint: string
  timeout: string
}): Promise<void> {
  const {
    repo: { owner, repo }
  } = github.context

  const result = await fetch(`${endpoint}/api/v1/ci`, {
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
        pr: github.context.payload.pull_request?.number,
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
    core.setFailed(
      'Invalid authentication. Please update your Graphite CI token.'
    )
    return
  }

  const octokit = github.getOctokit(github_token)
  const { GITHUB_RUN_ID } = process.env

  await octokit.rest.actions.cancelWorkflowRun({
    owner,
    repo,
    run_id: Number(GITHUB_RUN_ID)
  })

  if (result.status !== 200) {
    core.warning(
      'Response returned a non-200 status. Skipping Graphite checks.'
    )
    return
  }

  try {
    const body: {
      skip: boolean
    } = await result.json()

    if (body.skip) {
      const octokit = github.getOctokit(github_token)
      const { GITHUB_RUN_ID } = process.env

      await octokit.rest.actions.cancelWorkflowRun({
        owner,
        repo,
        run_id: Number(GITHUB_RUN_ID)
      })
    }
  } catch {
    core.warning('Failed to parse response body. Skipping Graphite checks.')
    return
  }
}
