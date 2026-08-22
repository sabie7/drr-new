     1	(function() {
     2	  // Helper functions for cleaner organization
     3	  const applyColors = (config) => {
     4	    if (config.primaryColor) document.documentElement.style.setProperty('--primary-color', config.primaryColor);
     5	    if (config.buttonColor) document.documentElement.style.setProperty('--button-color', config.buttonColor);
     6	    if (config.textColor) document.documentElement.style.setProperty('--text-color', config.textColor);
     7	  };
     8	
     9	  const applyImages = (config) => {
    10	    // Handle Logo/Favicon
    11	    const logo = document.getElementById('site-logo');
    12	    if (logo) {
    13	      if (config.showFavicon === 'false' || config.showFavicon === false) {
    14	        logo.style.display = 'none';
    15	      } else if (config.faviconUrl) {
    16	        if (logo.tagName === 'IMG') {
    17	          logo.src = config.faviconUrl;
    18	        } else {
    19	          const img = document.createElement('img');
    20	          img.id = 'site-logo';
    21	          img.src = config.faviconUrl;
    22	          img.className = logo.className;
    23	          img.style.cssText = logo.style.cssText;
    24	          img.setAttribute('referrerPolicy', 'origin-when-cross-origin');
    25	          img.setAttribute('loading', 'lazy');
    26	          logo.replaceWith(img);
    27	        }
    28	      }
    29	    }
    30	
    31	    // Handle Banner
    32	    const banner = document.querySelector('.site-banner');
    33	    if (banner) {
    34	      if (config.showBanner === 'false' || config.showBanner === false) {
    35	        banner.style.display = 'none';
    36	      } else if (config.bannerUrl) {
    37	        banner.src = config.bannerUrl;
    38	      }
    39	    }
    40	  };
    41	
    42	  // Main initialization
    43	  document.addEventListener('DOMContentLoaded', () => {
    44	    const config = window.domainConfig;
    45	    if (!config || Object.keys(config).length === 0) return;
    46	
    47	    applyColors(config);
    48	    applyImages(config);
    49	  });
    50	})();
    51	