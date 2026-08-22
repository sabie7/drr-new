     1	function triggerHeartsAnimation() {
     2	  const heartsContainer = document.createElement('div');
     3	  heartsContainer.style.position = 'fixed';
     4	  heartsContainer.style.top = '0';
     5	  heartsContainer.style.left = '0';
     6	  heartsContainer.style.width = '100vw';
     7	  heartsContainer.style.height = '100vh';
     8	  heartsContainer.style.pointerEvents = 'none';
     9	  heartsContainer.style.zIndex = '999999';
    10	  heartsContainer.style.overflow = 'hidden';
    11	  document.body.appendChild(heartsContainer);
    12	
    13	  const colors = ['#ff4d4d', '#ff7b7b', '#ff1a1a', '#e60000', '#ff9999'];
    14	  const heartCount = 40;
    15	
    16	  for (let i = 0; i < heartCount; i++) {
    17	    setTimeout(() => {
    18	      const heart = document.createElement('i');
    19	      heart.className = 'fas fa-heart';
    20	      heart.style.position = 'absolute';
    21	      heart.style.bottom = '-50px';
    22	      heart.style.left = Math.random() * 100 + 'vw';
    23	      heart.style.fontSize = (Math.random() * 20 + 15) + 'px';
    24	      heart.style.color = colors[Math.floor(Math.random() * colors.length)];
    25	      heart.style.opacity = Math.random() * 0.5 + 0.5;
    26	      heart.style.transform = `rotate(${Math.random() * 360}deg)`;
    27	      heart.style.transition = `transform ${Math.random() * 2 + 3}s linear, bottom ${Math.random() * 2 + 3}s ease-in, opacity ${Math.random() * 2 + 3}s ease-out`;
    28	      
    29	      heartsContainer.appendChild(heart);
    30	
    31	      // Trigger animation
    32	      requestAnimationFrame(() => {
    33	        requestAnimationFrame(() => {
    34	          heart.style.bottom = '120vh';
    35	          heart.style.transform = `rotate(${Math.random() * 360 + 360}deg)`;
    36	          heart.style.opacity = '0';
    37	        });
    38	      });
    39	
    40	      // Remove heart after animation
    41	      setTimeout(() => {
    42	        heart.remove();
    43	      }, 5000);
    44	    }, Math.random() * 2000);
    45	  }
    46	
    47	  // Remove container after all animations
    48	  setTimeout(() => {
    49	    heartsContainer.remove();
    50	  }, 8000);
    51	}
    52	