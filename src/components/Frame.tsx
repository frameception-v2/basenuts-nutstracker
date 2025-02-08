"use client";

import { useEffect, useCallback, useState } from "react";
import sdk, {
  AddFrame,
  SignIn as SignInCore,
  type Context,
} from "@farcaster/frame-sdk";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "~/components/ui/card";

import { config } from "~/components/providers/WagmiProvider";
import { truncateAddress } from "~/lib/truncateAddress";
import { base, optimism } from "wagmi/chains";
import { useSession } from "next-auth/react";
import { createStore } from "mipd";
import { Label } from "~/components/ui/label";
import { PROJECT_TITLE } from "~/lib/constants";

function NutsTrackerCard({ fid, profile }: { fid: number; profile?: any }) {
  const [nutsData, setNutsData] = useState<{
    sent: number;
    received: number;
    failedAttempts: number;
    lastUpdated: number;
  }>({ sent: 0, received: 0, failedAttempts: 0, lastUpdated: Date.now() });
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const calculateDailyAllowance = useCallback(() => {
    const now = new Date();
    const lastReset = new Date(now);
    
    if (now.getUTCHours() < RESET_HOUR_UTC) {
      lastReset.setUTCDate(now.getUTCDate() - 1);
    }
    
    lastReset.setUTCHours(RESET_HOUR_UTC, 0, 0, 0);
    return {
      remaining: DAILY_ALLOWANCE - nutsData.sent,
      nextReset: lastReset.getTime() + 86400000,
    };
  }, [nutsData.sent]);

  const { remaining, nextReset } = calculateDailyAllowance();

  const fetchNutsData = useCallback(async () => {
    try {
      const response = await fetch(
        `https://api.neynar.com/v2/farcaster/feed?feed_type=filter&filter_type=fids&fids=${fid}&start_time=${START_DATE}`,
        {
          headers: {
            "api_key": NEYNAR_API_KEY,
            "client_id": NEYNAR_CLIENT_ID,
          },
        }
      );
      
      const data = await response.json();
      let sentNuts = 0;
      let receivedNuts = 0;
      
      data.casts.forEach((cast: any) => {
        // Count sent nuts
        if (cast.author.fid === fid) {
          sentNuts += (cast.text.match(/🥜/g) || []).length;
        }
        // Count received nuts in replies
        if (cast.parent_author?.fid === fid) {
          receivedNuts += (cast.text.match(/🥜/g) || []).length;
        }
      });

      setNutsData(prev => ({
        sent: sentNuts,
        received: receivedNuts,
        failedAttempts: prev.failedAttempts + (sentNuts > DAILY_ALLOWANCE ? 1 : 0),
        lastUpdated: Date.now()
      }));
      setError("");
    } catch (err) {
      setError("Failed to fetch nuts data");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [fid]);

  useEffect(() => {
    fetchNutsData();
    const interval = setInterval(fetchNutsData, 1000);
    return () => clearInterval(interval);
  }, [fetchNutsData]);

  if (error) return <div className="text-red-500">{error}</div>;
  if (isLoading) return <div className="animate-pulse">Loading 🥜 stats...</div>;

  return (
    <Card className="animate-fade-in">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {profile?.pfp_url && (
            <img 
              src={profile.pfp_url} 
              alt="Profile" 
              className="w-8 h-8 rounded-full"
            />
          )}
          <span>{profile?.username || `FID: ${fid}`}</span>
        </CardTitle>
        <CardDescription>
          🥜 Tracking since Feb 1, 2025
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-purple-100 rounded-lg">
            <Label className="text-xs">Total Received</Label>
            <div className="text-2xl font-bold text-purple-600">
              {nutsData.received}
            </div>
          </div>
          
          <div className="p-3 bg-amber-100 rounded-lg">
            <Label className="text-xs">Daily Remaining</Label>
            <div className="text-2xl font-bold text-amber-600">
              {remaining > 0 ? remaining : 0}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Sent Today:</span>
            <span className="font-semibold">{nutsData.sent}/30</span>
          </div>
          
          <div className="h-2 bg-gray-200 rounded-full">
            <div 
              className="h-full bg-purple-500 rounded-full transition-all duration-500"
              style={{ width: `${(nutsData.sent / 30) * 100}%` }}
            />
          </div>
        </div>

        <div className="text-sm text-gray-500">
          Next reset in: {Math.floor((nextReset - Date.now()) / 3600000)} hours
        </div>
      </CardContent>
    </Card>
  );
}

export default function Frame() {
  const [isSDKLoaded, setIsSDKLoaded] = useState(false);
  const [context, setContext] = useState<Context.FrameContext>();

  const [added, setAdded] = useState(false);

  const [addFrameResult, setAddFrameResult] = useState("");

  const addFrame = useCallback(async () => {
    try {
      await sdk.actions.addFrame();
    } catch (error) {
      if (error instanceof AddFrame.RejectedByUser) {
        setAddFrameResult(`Not added: ${error.message}`);
      }

      if (error instanceof AddFrame.InvalidDomainManifest) {
        setAddFrameResult(`Not added: ${error.message}`);
      }

      setAddFrameResult(`Error: ${error}`);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      const context = await sdk.context;
      if (!context) {
        return;
      }

      setContext(context);
      setAdded(context.client.added);

      // If frame isn't already added, prompt user to add it
      if (!context.client.added) {
        addFrame();
      }

      sdk.on("frameAdded", ({ notificationDetails }) => {
        setAdded(true);
      });

      sdk.on("frameAddRejected", ({ reason }) => {
        console.log("frameAddRejected", reason);
      });

      sdk.on("frameRemoved", () => {
        console.log("frameRemoved");
        setAdded(false);
      });

      sdk.on("notificationsEnabled", ({ notificationDetails }) => {
        console.log("notificationsEnabled", notificationDetails);
      });
      sdk.on("notificationsDisabled", () => {
        console.log("notificationsDisabled");
      });

      sdk.on("primaryButtonClicked", () => {
        console.log("primaryButtonClicked");
      });

      console.log("Calling ready");
      sdk.actions.ready({});

      // Set up a MIPD Store, and request Providers.
      const store = createStore();

      // Subscribe to the MIPD Store.
      store.subscribe((providerDetails) => {
        console.log("PROVIDER DETAILS", providerDetails);
        // => [EIP6963ProviderDetail, EIP6963ProviderDetail, ...]
      });
    };
    if (sdk && !isSDKLoaded) {
      console.log("Calling load");
      setIsSDKLoaded(true);
      load();
      return () => {
        sdk.removeAllListeners();
      };
    }
  }, [isSDKLoaded, addFrame]);

  if (!isSDKLoaded) {
    return <div>Loading...</div>;
  }

  return (
    <div
      style={{
        paddingTop: context?.client.safeAreaInsets?.top ?? 0,
        paddingBottom: context?.client.safeAreaInsets?.bottom ?? 0,
        paddingLeft: context?.client.safeAreaInsets?.left ?? 0,
        paddingRight: context?.client.safeAreaInsets?.right ?? 0,
      }}
    >
      <div className="w-[380px] mx-auto py-2 px-2">
        <h1 className="text-3xl font-bold text-center mb-4 bg-gradient-to-r from-purple-600 to-amber-500 bg-clip-text text-transparent">
          {PROJECT_TITLE}
        </h1>
        
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => sdk.actions.post({
              text: "Check my 🥜 status!",
              url: window.location.href,
            })}
            className="flex-1 bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg transition-all"
          >
            Share It
          </button>
        </div>

        {context?.frameData?.fid && (
          <NutsTrackerCard 
            fid={context.frameData.fid} 
            profile={context.frameData.user}
          />
        )}
      </div>
    </div>
  );
}
