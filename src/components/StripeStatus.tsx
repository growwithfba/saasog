import { useSearchParams } from "next/navigation";
import router from "next/router";
import { useEffect } from "react";

const StripeStatus = () => {
  const searchParams = useSearchParams();
  const status = searchParams.get('status');

  // Check for success/cancel query params
  useEffect(() => {
    const success = searchParams.get('success');
    const canceled = searchParams.get('canceled');
    
    if (success) {
      // Show success message or redirect
      alert('Subscription successful! Welcome to your 7-day free trial.');
      router.push('/research');
    } else if (canceled) {
      // Show cancel message
      alert('Checkout was canceled. You can try again anytime.');
    }
  }, [searchParams, router]);
  
  return <></>;
};

export default StripeStatus;