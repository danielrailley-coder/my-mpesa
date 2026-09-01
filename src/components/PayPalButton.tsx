import { useEffect, useState, useRef } from 'react';

declare global {
  interface Window {
    paypal?: {
      Buttons: (config: PayPalButtonsConfig) => PayPalButtonsInstance;
    };
  }
}

type PayPalButtonsConfig = {
  style?: {
    layout?: string;
    color?: string;
    shape?: string;
    label?: string;
  };
  createOrder: (data: Record<string, unknown>, actions: { order: { create: (config: { intent: string; purchase_units: Array<{ amount: { currency_code: string; value: string } }> }) => Promise<string> } }) => Promise<string>;
  onApprove: (data: { orderID: string }, actions: { order: { capture: () => Promise<PayPalCaptureResult> } }) => Promise<void>;
  onError: (err: unknown) => void;
};

type PayPalButtonsInstance = {
  render: (selector: HTMLElement) => Promise<void>;
  close: () => void;
};

type PayPalCaptureResult = {
  id: string;
  status: string;
  purchase_units?: Array<{
    payments?: {
      captures?: Array<{ id: string }>;
    };
  }>;
};

type PayPalButtonProps = {
  amount: number;
  currency?: string;
  disabled?: boolean;
  onSuccess: (result: { orderId: string; status: string; captureId?: string }) => void;
  onError: (message: string) => void;
};

const PAYPAL_SDK_URL = 'https://www.paypal.com/sdk/js';

let sdkLoadPromise: Promise<void> | null = null;

function loadPayPalSDK(clientId: string, currency: string): Promise<void> {
  if (sdkLoadPromise) return sdkLoadPromise;
  if (window.paypal) return Promise.resolve();

  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${PAYPAL_SDK_URL}?client-id=${clientId}&currency=${currency}`;
    script.onload = () => resolve();
    script.onerror = () => {
      sdkLoadPromise = null;
      reject(new Error('Failed to load PayPal SDK'));
    };
    document.head.appendChild(script);
  });

  return sdkLoadPromise;
}

export default function PayPalButton({ amount, currency = 'USD', disabled, onSuccess, onError }: PayPalButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonsRef = useRef<PayPalButtonsInstance | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);

  const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;

  useEffect(() => {
    if (!clientId) {
      setSdkError('PayPal client ID is not configured.');
      return;
    }

    loadPayPalSDK(clientId, currency)
      .then(() => setSdkReady(true))
      .catch(() => setSdkError('Could not load PayPal. Please try again later.'));
  }, [clientId, currency]);

  useEffect(() => {
    if (!sdkReady || !window.paypal || !containerRef.current || disabled) return;

    const buttons = window.paypal.Buttons({
      style: {
        layout: 'vertical',
        color: 'blue',
        shape: 'rect',
        label: 'pay',
      },
      createOrder: async (_data, actions) => {
        const funcUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paypal-checkout`;
        const response = await fetch(funcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create', amount, currency }),
        });
        const result = await response.json();
        if (!response.ok || !result.order_id) {
          throw new Error(result.error || 'Failed to create PayPal order');
        }
        return result.order_id;
      },
      onApprove: async (data, actions) => {
        const captureResult = await actions.order.capture();
        onSuccess({
          orderId: captureResult.id,
          status: captureResult.status,
          captureId: captureResult.purchase_units?.[0]?.payments?.captures?.[0]?.id,
        });
      },
      onError: (err) => {
        const message = err instanceof Error ? err.message : 'PayPal payment failed. Please try again.';
        onError(message);
      },
    });

    buttonsRef.current = buttons;
    buttons.render(containerRef.current).catch(() => {
      onError('Could not display PayPal button. Please refresh the page.');
    });

    return () => {
      buttons.close();
      buttonsRef.current = null;
    };
  }, [sdkReady, amount, currency, disabled, onSuccess, onError]);

  if (sdkError) {
    return (
      <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
        {sdkError}
      </div>
    );
  }

  if (!sdkReady) {
    return (
      <div className="flex items-center justify-center rounded-xl bg-slate-50 px-4 py-4">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
      </div>
    );
  }

  return <div ref={containerRef} className={disabled ? 'pointer-events-none opacity-50' : ''} />;
}
