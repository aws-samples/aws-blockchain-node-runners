import React from 'react';
import CookieConsent, { Cookies, getCookieConsentValue } from "react-cookie-consent";
import {useLocation} from '@docusaurus/router';

// Default implementation, that you can customize
export default function Root({children}) {
    let location = useLocation();

    React.useEffect(() => {

        // check if dataLayer exists i.e can we track or not?
        if (typeof dataLayer !== 'undefined') {

            // send new event to Google Tag Manager
            dataLayer.push({event: 'pageview'});

        }
    }, [location]);

  return <>
        {/* Cookie consent tracking */}
        <CookieConsent
            buttonText="I understand"
            enableDeclineButton
            declineButtonText="No thanks"
            buttonClasses="button button--sm"
            declineButtonClasses="button button--sm"
            buttonWrapperClasses="button--secondary"
            location="top"
            overlay="true"
            setDeclineCookie>
         We use cookies to ensure you get the best experience on our website.
         </CookieConsent>

        {children}

    </>;
}
