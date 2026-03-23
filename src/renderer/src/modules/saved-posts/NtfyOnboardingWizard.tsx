import React, { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { IPC } from '../../../../shared/ipc-types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '../../components/ui/dialog'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'

interface NtfyOnboardingWizardProps {
  isOpen: boolean
  onClose: () => void
  onComplete?: () => void
  initialTopic?: string
  initialServerUrl?: string
}

function generateRandomTopic(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  const array = new Uint8Array(20)
  crypto.getRandomValues(array)
  for (let i = 0; i < 20; i++) {
    result += chars[array[i] % chars.length]
  }
  return result
}

export function NtfyOnboardingWizard({
  isOpen,
  onClose,
  onComplete,
  initialTopic,
  initialServerUrl
}: NtfyOnboardingWizardProps): React.ReactElement {
  const [step, setStep] = useState(1)
  const [topic, setTopic] = useState(initialTopic || generateRandomTopic())
  const [serverUrl, setServerUrl] = useState(initialServerUrl || 'https://ntfy.sh')
  const [testing, setTesting] = useState(false)
  const [platform, setPlatform] = useState<'ios' | 'android'>('ios')

  const topicUrl = useMemo(() => `${serverUrl}/${topic}`, [serverUrl, topic])

  const handleClose = (): void => {
    setStep(1)
    onClose()
  }

  const handleDone = async (): Promise<void> => {
    try {
      await window.api.invoke(IPC.SETTINGS_SET, 'ntfy_topic', topic.trim())
      await window.api.invoke(IPC.SETTINGS_SET, 'ntfy_server_url', serverUrl.trim())
      handleClose()
      onComplete?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save ntfy settings.')
    }
  }

  const handleTest = async (): Promise<void> => {
    setTesting(true)
    try {
      // Save settings first so the poll uses them
      await window.api.invoke(IPC.SETTINGS_SET, 'ntfy_topic', topic.trim())
      await window.api.invoke(IPC.SETTINGS_SET, 'ntfy_server_url', serverUrl.trim())
      const result = (await window.api.invoke(IPC.REDDIT_POLL_NTFY)) as {
        postsIngested: number
        messagesReceived: number
      }
      if (result.messagesReceived === 0) {
        toast.success('Connected to ntfy. No messages were found yet.')
      } else {
        toast.success(
          `Connected. Received ${result.messagesReceived} ntfy message${result.messagesReceived !== 1 ? 's' : ''} and saved ${result.postsIngested} Reddit post${result.postsIngested !== 1 ? 's' : ''}.`
        )
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reach the ntfy server. Check your topic and server URL.')
    } finally {
      setTesting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Set Up Mobile Post Saving</DialogTitle>
          <p className="text-xs text-muted-foreground">Step {step} of 4</p>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Save Reddit posts from your phone using{' '}
              <span className="font-medium text-foreground">ntfy.sh</span>, a free
              push notification service.
            </p>
            <p className="text-sm text-muted-foreground">
              When you find a post you want to save, share its URL to your ntfy topic.
              Personal News will pick it up automatically and store it with full
              metadata.
            </p>
            <p className="text-sm text-muted-foreground">
              You can optionally add a personal note by putting it on the lines after
              the URL.
            </p>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={handleClose}>
                Skip Setup
              </Button>
              <Button onClick={() => setStep(2)}>Next →</Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label htmlFor="ntfy-topic-name" className="text-sm font-medium mb-1 block">Topic Name</label>
              <div className="flex gap-2">
                <Input
                  id="ntfy-topic-name"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="my-saved-posts"
                />
                <Button
                  variant="outline"
                  onClick={() => setTopic(generateRandomTopic())}
                >
                  Regenerate
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Use a random topic name for privacy. Anyone with the name can send
                messages.
              </p>
            </div>
            <div>
              <label htmlFor="ntfy-server-url" className="text-sm font-medium mb-1 block">
                Server URL (optional)
              </label>
              <Input
                id="ntfy-server-url"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://ntfy.sh"
              />
            </div>
            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              Note: ntfy.sh retains messages for 24 hours. Open Personal News at least
              once a day to avoid missing posts.
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(1)}>
                ← Back
              </Button>
              <Button onClick={() => setStep(3)} disabled={!topic.trim()}>
                Next →
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-md bg-muted/50 p-3 space-y-1">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Topic:</span> {topic}
              </p>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Server:</span> {serverUrl}
              </p>
            </div>
            <Button
              onClick={() => void handleTest()}
              disabled={testing}
              variant="outline"
              className="w-full"
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </Button>
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground mb-2">
                Send a test message from your terminal:
              </p>
              <code className="text-xs block bg-background rounded p-2 overflow-x-auto select-all">
                curl -d &quot;https://reddit.com/r/test/comments/abc123/test&quot;{' '}
                {topicUrl}
              </code>
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(2)}>
                ← Back
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setStep(4)}>
                  Skip Test
                </Button>
                <Button onClick={() => setStep(4)}>Next →</Button>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant={platform === 'ios' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPlatform('ios')}
              >
                iOS
              </Button>
              <Button
                variant={platform === 'android' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPlatform('android')}
              >
                Android
              </Button>
            </div>

            {platform === 'ios' ? (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">iOS — Shortcuts Setup</p>
                <ol className="list-decimal list-inside space-y-1.5 text-xs">
                  <li>
                    Open the <span className="font-medium">Shortcuts</span> app on your
                    iPhone.
                  </li>
                  <li>
                    Create a new shortcut and choose one input option:{' '}
                    <span className="font-medium">Ask for Input</span> (line 1 = URL,
                    line 2 = notes) or <span className="font-medium">Get Clipboard</span>{' '}
                    (URL only, no notes).
                  </li>
                  <li>
                    Add a <span className="font-medium">Get Contents of URL</span>{' '}
                    action.
                  </li>
                  <li>
                    Set <span className="font-medium">Get contents of</span> to your ntfy
                    topic URL:
                    <code className="block bg-muted rounded p-1.5 mt-1 select-all">
                      {topicUrl}
                    </code>
                  </li>
                  <li>
                    Set <span className="font-medium">Method</span> to{' '}
                    <span className="font-medium">POST</span>.
                  </li>
                  <li>
                    Add a header: <span className="font-medium">content-type</span> ={' '}
                    <span className="font-medium">text/plain</span>.
                  </li>
                  <li>
                    Set <span className="font-medium">Request Body</span> to your chosen
                    input (<span className="font-medium">Ask for Input</span> or{' '}
                    <span className="font-medium">Clipboard</span>). Use raw text only (no
                    key required).
                  </li>
                </ol>
                <p className="text-xs mt-2">
                  Tip: when using Ask for Input, enter the Reddit URL on line 1 and your
                  note on line 2.
                </p>
              </div>
            ) : (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">
                  Android — HTTP Shortcuts Setup
                </p>
                <ol className="list-decimal list-inside space-y-1.5 text-xs">
                  <li>
                    Install{' '}
                    <span className="font-medium">HTTP Request Shortcuts</span> from
                    the Play Store.
                  </li>
                  <li>Create a new shortcut → type: Regular Shortcut.</li>
                  <li>
                    Set the URL to:
                    <code className="block bg-muted rounded p-1.5 mt-1 select-all">
                      {topicUrl}
                    </code>
                  </li>
                  <li>Method: POST, Body: plain text with the shared text variable.</li>
                  <li>
                    Enable &quot;Show in Share Menu&quot; so it appears in Android&apos;s
                    share sheet.
                  </li>
                </ol>
                <p className="text-xs mt-2">
                  To add a note: put the Reddit URL on the first line and your note on
                  the following lines.
                </p>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(3)}>
                ← Back
              </Button>
              <Button onClick={() => void handleDone()}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
