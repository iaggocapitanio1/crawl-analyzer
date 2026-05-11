import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { SWRConfig } from "swr";
import { swrFetcher } from "@/lib/api";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <SWRConfig value={{ fetcher: swrFetcher }}>
      <Component {...pageProps} />
    </SWRConfig>
  );
}
