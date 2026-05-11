import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { SWRConfig } from "swr";
import { swrFetcher } from "@/lib/api";
import { ToastProvider } from "@/components/Toast";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <SWRConfig
      value={{
        fetcher: swrFetcher,
        dedupingInterval: 5000,
        revalidateOnFocus: true,
        focusThrottleInterval: 30000,
        keepPreviousData: true,
        errorRetryCount: 2,
        shouldRetryOnError: (err) => {
          // Don't retry 4xx — those are client errors that won't change.
          const status = (err as { status?: number })?.status;
          return !status || status >= 500;
        },
      }}
    >
      <ToastProvider>
        <Component {...pageProps} />
      </ToastProvider>
    </SWRConfig>
  );
}
