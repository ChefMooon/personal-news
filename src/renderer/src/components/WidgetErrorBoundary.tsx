import React from 'react'
import { toast } from 'sonner'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from './ui/button'

interface WidgetErrorBoundaryProps {
  widgetTitle: string
  instanceId: string
  children: React.ReactNode
}

interface WidgetErrorBoundaryState {
  error: Error | null
  retryNonce: number
}

export class WidgetErrorBoundary extends React.Component<
  WidgetErrorBoundaryProps,
  WidgetErrorBoundaryState
> {
  constructor(props: WidgetErrorBoundaryProps) {
    super(props)
    this.state = { error: null, retryNonce: 0 }
  }

  static getDerivedStateFromError(error: Error): Partial<WidgetErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const { widgetTitle, instanceId } = this.props
    const fallbackMessage = `The ${widgetTitle} widget crashed.`
    toast.error(fallbackMessage)

    console.error('Widget render error', {
      widgetTitle,
      instanceId,
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack
    })
  }

  private handleRetry = (): void => {
    this.setState((prev) => ({ error: null, retryNonce: prev.retryNonce + 1 }))
  }

  render(): React.ReactNode {
    const { widgetTitle, children } = this.props
    const { error, retryNonce } = this.state

    if (error) {
      return (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="font-medium text-foreground">{widgetTitle} failed to render.</p>
              <p className="text-muted-foreground">{error.message || 'Unexpected rendering error.'}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={this.handleRetry}
                className="inline-flex items-center gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry widget
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return <React.Fragment key={retryNonce}>{children}</React.Fragment>
  }
}
