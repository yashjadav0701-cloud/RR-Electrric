(function() {
    'use strict';
    const InvoiceSettings = {
        storeName: "RR ELECTRRIC",
        address: "Shop No 2, Dharmdeep flat, vaishali road, beside sai vatika party plot, Nadiad",
        phone: "7573967357",
        email: "rrelectrric@gmail.com",
        terms: "Thank you for doing business with us.",
        description: "2 years replacement guarantee on applicable items.",
        signatoryName: "Rajan R Vaghela",
        // Use your absolute paths for images to prevent PDF generation errors
        logoUrl: "/assets/icon.png", 
        signatureUrl: "/assets/signature.png" // You will need to upload a signature.png to your assets folder
    };
    // Custom UI Engine for Modals & Selects
    const CustomUI = {
        dialogTemplate: `
            <div id="custom-dialog" class="custom-dialog-overlay">
                <div class="custom-dialog-box">
                    <div id="custom-dialog-title" class="custom-dialog-title"></div>
                    <div id="custom-dialog-msg" class="custom-dialog-msg"></div>
                    <div class="custom-dialog-actions">
                        <button id="custom-dialog-cancel" class="btn-secondary">Cancel</button>
                        <button id="custom-dialog-confirm" class="btn-primary">OK</button>
                    </div>
                </div>
            </div>
        `,
        init: function() {
            if (!document.getElementById('custom-dialog')) {
                document.body.insertAdjacentHTML('beforeend', this.dialogTemplate);
            }
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.custom-select-wrapper')) {
                    document.querySelectorAll('.custom-select-options').forEach(el => el.classList.remove('open'));
                }
            });
        },
        alert: function(msg, title = "Notification") {
            return new Promise((resolve) => this.showDialog(title, msg, false, resolve));
        },
        confirm: function(msg, title = "Confirm Action") {
            return new Promise((resolve) => this.showDialog(title, msg, true, resolve));
        },
        showDialog: function(title, msg, isConfirm, resolve) {
            const overlay = document.getElementById('custom-dialog');
            document.getElementById('custom-dialog-title').textContent = title;
            document.getElementById('custom-dialog-msg').innerHTML = msg;
            const cancelBtn = document.getElementById('custom-dialog-cancel');
            const confirmBtn = document.getElementById('custom-dialog-confirm');
            
            cancelBtn.style.display = isConfirm ? 'inline-flex' : 'none';
            const close = (result) => {
                overlay.classList.remove('active');
                cancelBtn.onclick = null; confirmBtn.onclick = null;
                setTimeout(() => resolve(result), 200);
            };
            cancelBtn.onclick = () => close(false);
            confirmBtn.onclick = () => close(true);
            overlay.classList.add('active');
        },
        styleSelects: function() {
            document.querySelectorAll('select:not(.custom-styled)').forEach(select => {
                select.classList.add('custom-styled');
                select.style.display = 'none';
                
                const wrapper = document.createElement('div');
                wrapper.className = 'custom-select-wrapper';
                const trigger = document.createElement('div');
                trigger.className = 'custom-select-trigger';
                
                const selectedOption = select.options[select.selectedIndex];
                trigger.innerHTML = `<span>${selectedOption ? selectedOption.text : ''}</span><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
                
                const optionsContainer = document.createElement('div');
                optionsContainer.className = 'custom-select-options';
                
                Array.from(select.options).forEach((opt, index) => {
                    const optDiv = document.createElement('div');
                    optDiv.className = 'custom-select-option' + (opt.selected ? ' selected' : '');
                    optDiv.textContent = opt.text;
                    optDiv.onclick = (e) => {
                        e.stopPropagation();
                        select.selectedIndex = index;
                        trigger.querySelector('span').textContent = opt.text;
                        optionsContainer.classList.remove('open');
                        Array.from(optionsContainer.children).forEach(c => c.classList.remove('selected'));
                        optDiv.classList.add('selected');
                        select.dispatchEvent(new Event('change'));
                    };
                    optionsContainer.appendChild(optDiv);
                });
                
                trigger.onclick = (e) => {
                    e.stopPropagation();
                    const wasOpen = optionsContainer.classList.contains('open');
                    document.querySelectorAll('.custom-select-options').forEach(el => el.classList.remove('open'));
                    if (!wasOpen) optionsContainer.classList.add('open');
                };
                wrapper.appendChild(trigger);
                wrapper.appendChild(optionsContainer);
                select.parentNode.insertBefore(wrapper, select.nextSibling);
            });
        }
    };

    // TODO: Replace with your actual Supabase URL and Anon Key
    const SUPABASE_URL = 'https://ycckkswajajrqobrohcx.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljY2trc3dhamFqcnFvYnJvaGN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNjQ4MTgsImV4cCI6MjEwMTk0MDgxOH0.G7CQyOFTy_LpOP3PK2QprHDx8cXP_ugqH0mTJaM9Oy4';
    
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const Store = {
        state: {
            products: [],
            categories: [],
            config: {},
            cart: [], // Array of { id, qty }
            vipTiers: [],
            coupons: [],
            appliedCouponCode: null,
            customerInfo: {},
            // Front-end UI state
            homeDisplayLimit: 12,
            homeCurrentSort: 'recommended',
            categoryCurrentSort: 'recommended',
            currentCategoryParam: null
        },

        normalizeSearchText: function(text) {
            if (!text) return '';
            return text.toLowerCase()
                .replace(/\bl\s*&\s*t\b/g, 'lnt') // Preserve L&T as unified token
                .replace(/\bl\s+t\b/g, 'lnt')
                .replace(/[^a-z0-9\s]/g, ' ') // Remove punctuation
                .replace(/\b(watts|watt)\b/g, 'w')
                .replace(/\b(kilowatts|kilowatt|kwatt)\b/g, 'kw')
                .replace(/\b(volts|volt)\b/g, 'v')
                .replace(/\b(amps|ampere|amp)\b/g, 'a')
                .replace(/\b(hertz)\b/g, 'hz')
                .replace(/(\d+)\s+(w|kw|v|a|hz)\b/g, '$1$2') // Compress "9 w" to "9w"
                .replace(/\s+/g, ' ') // Remove extra spaces
                .trim();
        },

        performSearch: function(query) {
            if (!query) return [];
            const originalQuery = query.toLowerCase().trim();
            const q = this.normalizeSearchText(originalQuery);
            const queryTokens = q.split(' ').filter(t => t);

            if (queryTokens.length === 0) return [];

            const scoredMatches = this.state.products.map(p => {
                let score = 0;
                
                // Lazy build lightweight search index so we don't lag the initial load
                if (!p._searchName) {
                    p._searchName = p.name.toLowerCase();
                    p._searchNormName = this.normalizeSearchText(p.name);
                    p._searchCat = (p.categories?.name || '').toLowerCase();
                    p._searchNormCat = this.normalizeSearchText(p.categories?.name || '');
                    p._searchNormDesc = this.normalizeSearchText(p.description || '');
                }

                // 1. Exact Phrase Match
                if (p._searchName.includes(originalQuery)) score += 100;
                
                // 2. Exact Normalized Phrase Match
                if (p._searchNormName.includes(q)) score += 80;

                // 3. Token Matching & Strict Relevance
                let tokensMatched = 0;
                const nameWords = p._searchNormName.split(' ');
                const catWords = p._searchNormCat.split(' ');

                queryTokens.forEach(token => {
                    let tokenScore = 0;
                    const isShortToken = token.length <= 2;
                    
                    if (nameWords.includes(token)) {
                        tokenScore += 30; // Exact full token match in product name
                    } else if (catWords.includes(token)) {
                        tokenScore += 20; // Exact token in category
                    } else if (!isShortToken) {
                        // Substring partial matches allowed ONLY for tokens longer than 2 letters
                        if (p._searchNormName.includes(token)) tokenScore += 8;
                        else if (p._searchNormCat.includes(token)) tokenScore += 5;
                        else if (p._searchNormDesc.includes(token)) tokenScore += 2;
                    }
                    
                    if (tokenScore > 0) {
                        tokensMatched++;
                        score += tokenScore;
                    }
                });

                // Require all query tokens to match for multi-token queries
                if (queryTokens.length > 1 && tokensMatched < queryTokens.length) {
                    score = 0;
                } else if (tokensMatched > 0) {
                    score += (tokensMatched / queryTokens.length) * 50; 
                }

                return { product: p, score: score };
            }).filter(m => m.score > 0);

            // Sort strictly by highest relevance score
            scoredMatches.sort((a, b) => b.score - a.score);

            return scoredMatches.map(m => m.product);
        },

        init: async function() {
            CustomUI.init();
            this._initStartTime = Date.now();
            document.getElementById('year').textContent = new Date().getFullYear();
            this.initPWA();
            this.bindEvents();
            this.loadCart();
            this.loadCustomerInfo();
            
            // Handle browser Back/Forward buttons via History API
            window.addEventListener('popstate', (e) => {
                if (e.state && e.state.view) {
                    this.renderView(e.state.view, e.state.param, false);
                } else {
                    this.renderView('home', null, false);
                }
            });

            await this.fetchData();
            
            // Initial routing based on URL hash (if any) or default to home
            this.routeInitial();

            // Hide preloader smoothly after data load (removed artificial 3-second bottleneck)
            const elapsed = Date.now() - this._initStartTime;
            const remainingTime = Math.max(0, 300 - elapsed); // 300ms minimum to prevent aggressive flashing
            
            setTimeout(() => {
                const preloader = document.getElementById('global-preloader');
                if (preloader) preloader.classList.add('hidden');
            }, remainingTime);
        },

        initPWA: function() {
            // Safely register Service Worker
            if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('PWA SW failed:', err));
                });
            }

            let deferredPrompt;
            const installContainer = document.getElementById('pwa-install-container');
            const installBtn = document.getElementById('btn-install-pwa');

            if (!installContainer) return;

            // Force clear any previous dismissals so the banner always shows when eligible
            localStorage.removeItem('rr_pwa_dismissed');

            window.addEventListener('beforeinstallprompt', (e) => {
                // Prevent Chrome from automatically showing the native prompt
                e.preventDefault();
                // Stash the event so it can be triggered later
                deferredPrompt = e;
                // Update UI to notify the user they can add to home screen
                installContainer.classList.remove('hidden');
            });

            if (installBtn) {
                installBtn.addEventListener('click', async () => {
                    if (!deferredPrompt) return;
                    // Show the native install prompt
                    deferredPrompt.prompt();
                    // Wait for the user to respond to the prompt
                    const { outcome } = await deferredPrompt.userChoice;
                    if (outcome === 'accepted') {
                        installContainer.classList.add('hidden');
                    }
                    deferredPrompt = null;
                });
            }

            window.addEventListener('appinstalled', () => {
                // Clear the prompt and hide UI if installed externally
                installContainer.classList.add('hidden');
                deferredPrompt = null;
            });
        },

        bindEvents: function() {
            // Hidden Admin Access trigger: Shift + R
            document.addEventListener('keydown', (e) => {
                if (e.shiftKey && e.key.toLowerCase() === 'r') {
                    const activeTag = document.activeElement ? document.activeElement.tagName : '';
                    if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
                        e.preventDefault();
                        window.location.href = '/admin.html';
                    }
                }
            });

            const searchTrigger = document.querySelector('.search-trigger');
            const searchBar = document.getElementById('search-bar');
            
            if(searchTrigger && searchBar) {
                searchTrigger.addEventListener('click', () => {
                    searchBar.classList.toggle('hidden');
                    if (!searchBar.classList.contains('hidden')) {
                        document.getElementById('search-input').focus();
                    } else {
                        document.getElementById('search-results').innerHTML = ''; // clear on close
                    }
                });

                // Close search bar when clicking outside of it
                document.addEventListener('click', (e) => {
                    if (!searchBar.classList.contains('hidden') && 
                        !searchBar.contains(e.target) && 
                        !searchTrigger.contains(e.target)) {
                        searchBar.classList.add('hidden');
                        document.getElementById('search-results').innerHTML = '';
                    }
                });
            }

            // Live Search with Debounce
            const searchInput = document.getElementById('search-input');
            const searchResults = document.getElementById('search-results');
            
            let searchTimeout;
            if (searchInput && searchResults) {
                searchInput.addEventListener('input', (e) => {
                    clearTimeout(searchTimeout);
                    const q = e.target.value.trim().toLowerCase();
                    
                    if (!q) {
                        searchResults.innerHTML = '';
                        return;
                    }
                    
                    // 300ms debounce
                    searchTimeout = setTimeout(() => {
                        // Save last search to personalize 'recommended' sorting
                        localStorage.setItem('rr_last_search', q);
                        
                        const matches = Store.performSearch(q);
                        
                        if (matches.length === 0) {
                            searchResults.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--text-muted);">No results found for "${q}"</div>`;
                            return;
                        }
                        
                        const topMatches = matches.slice(0, 5); // Show max 5 in dropdown
                        let html = topMatches.map(p => {
                            const img = p.image_urls?.[0] || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" background="%23f1f5f9"></svg>';
                            return `
                                <a href="javascript:void(0)" class="search-suggestion-item" onclick="document.getElementById('search-bar').classList.add('hidden'); Store.navigate('product', '${p.id}')">
                                    <img src="${img}" class="search-suggestion-img" alt="${p.name}">
                                    <div class="search-suggestion-details">
                                        <div style="font-size: 10px; color: var(--primary); text-transform: uppercase; font-weight: 700; margin-bottom: 2px;">${p.categories?.name || 'Uncategorized'}</div>
                                        <div class="search-suggestion-title">${p.name}</div>
                                        <div class="search-suggestion-price">
                                            <span style="font-weight: 700; color: var(--text-main);">₹${p.selling_price}</span>
                                            ${(p.mrp_price && p.mrp_price > p.selling_price) ? `<span style="font-size: 11px; color: var(--text-muted); margin-left: 6px;">MRP <span style="text-decoration: line-through;">₹${p.mrp_price}</span></span>` : ''}
                                        </div>
                                    </div>
                                </a>
                            `;
                        }).join('');
                        
                        if (matches.length > 5) {
                            html += `<a href="javascript:void(0)" class="search-view-all" onclick="document.getElementById('search-bar').classList.add('hidden'); Store.navigate('search', decodeURIComponent('${encodeURIComponent(q)}'))">View all ${matches.length} results →</a>`;
                        }
                        
                        searchResults.innerHTML = html;
                    }, 300);
                });

                // Trigger full search on Enter key
                searchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        const q = e.target.value.trim();
                        if (q) {
                            document.getElementById('search-bar').classList.add('hidden');
                            Store.navigate('search', q);
                        }
                    }
                });
            }
            
            document.querySelector('.cart-trigger').addEventListener('click', () => {
                Store.navigate('cart');
            });
        },

        fetchData: async function() {
            try {
                // Fetch active products, categories, configs, VIP simultaneously
                const [prodRes, catRes, confRes, vipRes] = await Promise.all([
                    supabase.from('products').select('*, categories(name)').eq('is_active', true).order('created_at', { ascending: false }),
                    supabase.from('categories').select('*').order('name'),
                    supabase.from('store_configurations').select('*'),
                    supabase.from('vip_tiers').select('*').eq('is_active', true).order('min_spend', { ascending: false })
                ]);

                if (prodRes.error) throw prodRes.error;
                
                this.state.products = prodRes.data || [];
                this.state.categories = catRes.data || [];
                this.state.vipTiers = vipRes.data || []; // Active VIP tiers loaded live
                this.state.coupons = [];
                
                // Validate any saved coupon completely via the secure Server-Side Edge Function
                if (this.state.appliedCouponCode) {
                    try {
                        const { data } = await supabase.functions.invoke('validate-coupon', {
                            body: { code: this.state.appliedCouponCode }
                        });
                        if (data && data.valid) {
                            this.state.coupons = [data.coupon];
                        } else {
                            this.state.appliedCouponCode = null;
                        }
                    } catch (err) {
                        this.state.appliedCouponCode = null;
                    }
                }
                
                const configs = confRes.data || [];
                this.state.config.homeCategories = configs.find(c => c.config_key === 'homepage_settings')?.config_value?.featured_categories || [];
                
                const storeInfo = configs.find(c => c.config_key === 'store_info')?.config_value || {};
                this.state.config.storeInfo = storeInfo; // Save for WhatsApp flow
                
                const deliverySettings = configs.find(c => c.config_key === 'delivery_settings')?.config_value || {};
                this.state.config.deliverySettings = deliverySettings;
                
                if (storeInfo.name) {
                    document.title = `${storeInfo.name} — Branded Electrical Products in Nadiad`;
                }

                const mapsUrl = storeInfo.maps_url || 'https://maps.google.com/?q=Nadiad+Gujarat';
                const heroMaps = document.getElementById('hero-maps-link');
                const footerMaps = document.getElementById('footer-maps-link');
                if (heroMaps) heroMaps.href = mapsUrl;
                if (footerMaps) footerMaps.href = mapsUrl;

                const addressText = document.getElementById('hero-address-text');
                if (addressText) {
                    addressText.innerHTML = storeInfo.address ? storeInfo.address.replace(/\n/g, '<br>') : 'Visit our store in Nadiad';
                }

                const footerAddressText = document.getElementById('footer-address-text');
                if (footerAddressText) {
                    footerAddressText.innerHTML = storeInfo.address ? storeInfo.address.replace(/\n/g, '<br>') : 'Visit our store in Nadiad';
                }

                const heroCall = document.getElementById('hero-call-link');
                const heroWa = document.getElementById('hero-wa-link');
                const footerCall = document.getElementById('footer-call-link');
                const footerWa = document.getElementById('footer-wa-link');

                if (storeInfo.whatsapp) {
                    const cleanPhone = storeInfo.whatsapp.replace(/[^0-9+]/g, '');
                    const cleanWa = storeInfo.whatsapp.replace(/[^0-9]/g, ''); // wa.me requires digits only
                    if (heroCall) heroCall.href = `tel:${cleanPhone}`;
                    if (heroWa) heroWa.href = `https://wa.me/${cleanWa}?text=Hi%20RR%20ELECTRRIC,%20I%20have%20an%20inquiry.`;
                    if (footerCall) footerCall.href = `tel:${cleanPhone}`;
                    if (footerWa) footerWa.href = `https://wa.me/${cleanWa}?text=Hi%20RR%20ELECTRRIC,%20I%20have%20an%20inquiry.`;
                } else {
                    if (heroCall) heroCall.style.display = 'none';
                    if (heroWa) heroWa.style.display = 'none';
                    if (footerCall) footerCall.style.display = 'none';
                    if (footerWa) footerWa.style.display = 'none';
                }

                document.getElementById('store-loader').classList.add('hidden');
            } catch (err) {
                console.error("Failed to load store data:", err);
                document.getElementById('store-loader').textContent = "Failed to load store. Please refresh.";
            }
        },

        routeInitial: function() {
            const hash = window.location.hash;
            if (hash.startsWith('#product-')) {
                this.navigate('product', hash.replace('#product-', ''), true);
            } else if (hash === '#categories') {
                this.navigate('categories', null, true);
            } else if (hash.startsWith('#category-')) {
                this.navigate('category', hash.replace('#category-', ''), true);
            } else if (hash.startsWith('#search-')) {
                this.navigate('search', decodeURIComponent(hash.replace('#search-', '')), true);
            } else if (hash === '#cart') {
                this.navigate('cart', null, true);
            } else if (hash === '#checkout') {
                this.navigate('checkout', null, true);
            } else {
                this.navigate('home', null, true);
            }
        },

        navigate: function(view, param = null, pushHistory = true) {
            if (pushHistory) {
                let hash = '';
                if (view === 'product') hash = `#product-${param}`;
                if (view === 'categories') hash = `#categories`;
                if (view === 'category') hash = `#category-${param}`;
                if (view === 'search') hash = `#search-${encodeURIComponent(param)}`;
                if (view === 'cart') hash = `#cart`;
                if (view === 'checkout') hash = `#checkout`;
                window.history.pushState({ view, param }, '', hash || window.location.pathname);
            }
            this.renderView(view, param);
        },

        renderView: function(view, param) {
            document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
            window.scrollTo(0, 0);
            
            // Update Mobile Bottom Nav & Desktop Nav state
            document.querySelectorAll('.bottom-nav-item').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.desktop-nav-link').forEach(el => el.classList.remove('active'));

            if (view === 'home') {
                document.getElementById('nav-home')?.classList.add('active');
                document.getElementById('desktop-nav-home')?.classList.add('active');
            }
            if (view === 'categories' || view === 'category') {
                document.getElementById('nav-categories')?.classList.add('active');
                document.getElementById('desktop-nav-categories')?.classList.add('active');
            }
            if (view === 'cart' || view === 'checkout') {
                document.getElementById('nav-cart')?.classList.add('active');
            }

            if (view === 'home') {
                this.renderHome();
                document.getElementById('view-home').classList.remove('hidden');
            } else if (view === 'categories') {
                this.renderCategoriesIndex();
                document.getElementById('view-categories').classList.remove('hidden');
            } else if (view === 'category') {
                this.renderCategory(param);
                document.getElementById('view-category').classList.remove('hidden');
            } else if (view === 'product') {
                this.renderProduct(param);
                document.getElementById('view-product').classList.remove('hidden');
            } else if (view === 'search') {
                this.renderSearch(param);
                document.getElementById('view-search').classList.remove('hidden');
            } else if (view === 'cart') {
                this.renderCart();
                document.getElementById('view-cart').classList.remove('hidden');
            } else if (view === 'checkout') {
                this.renderCheckout();
                document.getElementById('view-checkout').classList.remove('hidden');
            }
        },

        // --- RENDERERS ---

        generateProductCardHTML: function(p) {
            const img = p.image_urls?.[0] || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" background="%23f1f5f9"></svg>';
            
            let discountHtml = '';
            if (p.mrp_price && p.mrp_price > p.selling_price) {
                const off = Math.round(((p.mrp_price - p.selling_price) / p.mrp_price) * 100);
                discountHtml = `<div class="product-discount-badge">${off}% OFF</div>`;
            }

            // Build dynamic comparison string (MRP only)
            let comparisonHtml = [];
            if (p.mrp_price && p.mrp_price > p.selling_price) {
                comparisonHtml.push(`<span>MRP <span style="text-decoration: line-through;">₹${p.mrp_price}</span></span>`);
            }
            let compareString = comparisonHtml.join('');

            return `
                <a href="javascript:void(0)" onclick="Store.navigate('product', '${p.id}')" class="store-product-card">
                    ${discountHtml}
                    <div class="img-wrapper">
                        <img src="${img}" alt="${p.name}" loading="lazy">
                    </div>
                    <div class="details">
                        <h3>${p.name}</h3>
                        <div class="price-row" style="align-items: flex-end;">
                            <div class="price-col" style="gap: 2px;">
                                <span class="selling-price" style="line-height: 1;">₹${p.selling_price}</span>
                                ${compareString ? `<div style="font-size: 11px; color: var(--text-muted); display: flex; align-items: center; flex-wrap: wrap; line-height: 1.2; margin-top: 4px;">${compareString}</div>` : '<span></span>'}
                            </div>
                            <button type="button" class="btn-add-cart-small" style="flex-shrink: 0;" onclick="event.preventDefault(); event.stopPropagation(); Store.addToCart('${p.id}')" aria-label="Add to Bag">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            </button>
                        </div>
                    </div>
                </a>
            `;
        },

        sortArray: function(arr, sortMode) {
            let sorted = [...arr];
            
            if (sortMode === 'recommended') {
                // True Random Shuffle: No search bias, strictly random on every load
                for (let i = sorted.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
                }
            } else if (sortMode === 'price-low') {
                sorted.sort((a,b) => a.selling_price - b.selling_price);
            } else if (sortMode === 'price-high') {
                sorted.sort((a,b) => b.selling_price - a.selling_price);
            } else if (sortMode === 'newest') {
                sorted.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
            }
            
            return sorted;
        },

        renderHome: function() {
            this.updateHomeGrid();
            setTimeout(() => CustomUI.styleSelects(), 0);
        },

        updateHomeSort: function() {
            this.state.homeCurrentSort = document.getElementById('home-sort').value;
            this.state.homeDisplayLimit = 12; // Reset pagination on sort
            this.updateHomeGrid();
        },

        loadMoreHomeProducts: function() {
            this.state.homeDisplayLimit += 12;
            this.updateHomeGrid();
        },

        updateHomeGrid: function() {
            const grid = document.getElementById('home-products-grid');
            const loadMoreContainer = document.getElementById('home-load-more-container');
            
            // 1. Base List
            let displayList = this.state.products;

            // 2. Sort
            displayList = this.sortArray(displayList, this.state.homeCurrentSort);

            // 3. Render
            if (displayList.length === 0) {
                grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px 0; color: var(--text-muted);">No products found matching criteria.</div>';
                loadMoreContainer.classList.add('hidden');
                return;
            }

            const paginatedList = displayList.slice(0, this.state.homeDisplayLimit);
            grid.innerHTML = paginatedList.map(p => this.generateProductCardHTML(p)).join('');

            // Hide Load More if we reached the end
            if (displayList.length <= this.state.homeDisplayLimit) {
                loadMoreContainer.classList.add('hidden');
            } else {
                loadMoreContainer.classList.remove('hidden');
            }
        },

        generateCategoryThumbnailHTML: function(p) {
            const img = p.image_urls?.[0] || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" background="%23f1f5f9"></svg>';
            return `
                <a href="javascript:void(0)" onclick="Store.navigate('product', '${p.id}')" class="category-thumb-card" title="${p.name}">
                    <img src="${img}" alt="${p.name}" loading="lazy">
                </a>
            `;
        },

        renderCategoriesIndex: function() {
            const container = document.getElementById('categories-index-container');
            
            // Only show categories that actually have active products inside them
            const activeCatIds = [...new Set(this.state.products.map(p => p.category_id))];
            const displayCategories = this.state.categories.filter(c => activeCatIds.includes(c.id));
            
            if (displayCategories.length === 0) {
                container.innerHTML = '<div style="text-align:center; padding: 40px 0; color: var(--text-muted);">No categories available.</div>';
                return;
            }

            container.innerHTML = displayCategories.map(c => {
                // Get up to 6 compact previews for the category row
                const catProducts = this.state.products.filter(p => p.category_id === c.id).slice(0, 6);
                
                return `
                    <div class="category-discovery-section">
                        <div class="category-discovery-header">
                            <h2>${c.name}</h2>
                            <a href="javascript:void(0)" onclick="Store.navigate('category', '${c.id}')">See more →</a>
                        </div>
                        <div class="category-discovery-row">
                            ${catProducts.map(p => this.generateCategoryThumbnailHTML(p)).join('')}
                        </div>
                    </div>
                `;
            }).join('');
        },

        renderSearch: function(query) {
            document.getElementById('search-page-title').textContent = `Results for "${query}"`;
            const q = query.toLowerCase();
            
            // Save last search to personalize 'recommended' sorting
            localStorage.setItem('rr_last_search', q);
            
            const matches = this.performSearch(query);
            
            const grid = document.getElementById('search-grid');
            if (matches.length === 0) {
                grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px 0; color: var(--text-muted);">No products found matching "${query}".</div>`;
                return;
            }
            
            grid.innerHTML = matches.map(p => this.generateProductCardHTML(p)).join('');
        },

        renderCategory: function(catId) {
            this.state.currentCategoryParam = catId;
            const catObj = this.state.categories.find(c => c.id === catId);
            document.getElementById('category-page-title').textContent = catObj ? catObj.name : 'Category';
            
            // Ensure sort dropdown matches state
            const sortSelect = document.getElementById('category-sort');
            sortSelect.value = this.state.categoryCurrentSort;
            
            // Update custom select UI if it exists
            const customOptions = sortSelect.nextElementSibling?.querySelectorAll('.custom-select-option');
            if (customOptions) {
                customOptions.forEach((opt, idx) => {
                    opt.classList.toggle('selected', sortSelect.selectedIndex === idx);
                    if (sortSelect.selectedIndex === idx) {
                        sortSelect.nextElementSibling.querySelector('span').textContent = opt.textContent;
                    }
                });
            }

            this.updateCategoryGrid();
            setTimeout(() => CustomUI.styleSelects(), 0);
        },

        updateCategorySort: function() {
            this.state.categoryCurrentSort = document.getElementById('category-sort').value;
            this.updateCategoryGrid();
        },

        updateCategoryGrid: function() {
            const catId = this.state.currentCategoryParam;
            let catProducts = this.state.products.filter(p => p.category_id === catId);
            const grid = document.getElementById('category-products-grid');

            if (catProducts.length === 0) {
                grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px 0; color: var(--text-muted);">No products in this category.</div>';
                return;
            }

            catProducts = this.sortArray(catProducts, this.state.categoryCurrentSort);
            grid.innerHTML = catProducts.map(p => this.generateProductCardHTML(p)).join('');
        },

        renderProduct: function(productId) {
            const p = this.state.products.find(x => x.id === productId);
            const container = document.getElementById('product-detail-container');
            
            if (!p) {
                container.innerHTML = '<div style="padding:40px 16px; text-align:center;">Product not found.</div>';
                return;
            }

            document.title = `RR ELECTRRIC — ${p.name}`;

            const images = (p.image_urls && p.image_urls.length > 0) ? p.image_urls : ['data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" background="%23f1f5f9"></svg>'];
            const totalImages = images.length;

            let dotsHtml = '';
            let slidesHtml = '';
            
            if (totalImages > 1) {
                // Clone last image for infinite loop start
                slidesHtml += `<div class="carousel-slide clone" onclick="Store.openLightbox('${images[totalImages - 1]}')" style="cursor: zoom-in;"><img src="${images[totalImages - 1]}" alt="${p.name}"></div>`;
            }

            images.forEach((url, i) => {
                slidesHtml += `<div class="carousel-slide" onclick="Store.openLightbox('${url}')" style="cursor: zoom-in;"><img src="${url}" alt="${p.name}"></div>`;
                if (totalImages > 1) {
                    dotsHtml += `<div class="dot ${i === 0 ? 'active' : ''}" data-index="${i}"></div>`;
                }
            });

            if (totalImages > 1) {
                // Clone first image for infinite loop end
                slidesHtml += `<div class="carousel-slide clone" onclick="Store.openLightbox('${images[0]}')" style="cursor: zoom-in;"><img src="${images[0]}" alt="${p.name}"></div>`;
            }

            const related = this.state.products
                .filter(x => x.category_id === p.category_id && x.id !== p.id)
                .slice(0, 4);

            let relatedHtml = '';
            if (related.length > 0) {
                relatedHtml = `
                    <div style="padding: 16px; margin-top: 24px; border-top: 1px solid var(--border);">
                        <h2 style="font-size: 18px; margin-bottom: 16px;">You may also like</h2>
                        <div class="products-grid">
                            ${related.map(r => this.generateProductCardHTML(r)).join('')}
                        </div>
                    </div>
                `;
            }

            container.innerHTML = `
                <div class="product-detail-layout">
                    <div class="product-image-section">
                        <div class="carousel-wrapper">
                            <div class="carousel-track" id="pdp-carousel">
                                ${slidesHtml}
                            </div>
                            <div class="carousel-dots" id="pdp-dots">
                                ${dotsHtml}
                            </div>
                        </div>
                    </div>

                    <div class="product-info-section pdp-info">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;">
                            <div>
                                <div class="pdp-cat">${p.categories?.name || ''}</div>
                                <h1 class="pdp-title" style="margin-bottom: 0;">${p.name}</h1>
                            </div>
                            <button class="icon-btn" onclick="Store.shareProduct('${p.id}')" aria-label="Share Product" style="flex-shrink: 0; background: var(--bg-surface); border: 1px solid var(--border); box-shadow: var(--shadow-sm);">
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                            </button>
                        </div>
                        <div style="margin-bottom: 16px;"></div>
                        
                        ${(() => {
                            let pricingHtml = `<div style="display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid var(--border);">`;

                            // Left side: Price & MRP
                            pricingHtml += `<div style="display: flex; flex-direction: column;">`;
                            pricingHtml += `<div style="display: flex; align-items: center; gap: 12px; margin-bottom: 6px;">`;
                            pricingHtml += `<div style="font-size: 32px; font-weight: 800; color: var(--text-main); line-height: 1;">₹${p.selling_price}</div>`;
                            
                            if (p.mrp_price && p.mrp_price > p.selling_price) {
                                const off = Math.round(((p.mrp_price - p.selling_price) / p.mrp_price) * 100);
                                pricingHtml += `<div style="background: #fee2e2; color: #dc2626; padding: 4px 8px; border-radius: 4px; font-weight: 800; font-size: 14px; line-height: 1;">${off}% OFF</div>`;
                            }
                            pricingHtml += `</div>`;
                            
                            if (p.mrp_price && p.mrp_price > p.selling_price) {
                                pricingHtml += `<div style="font-size: 14px; color: var(--text-muted); font-weight: 500;">MRP <span style="text-decoration: line-through;">₹${p.mrp_price}</span></div>`;
                            }
                            pricingHtml += `</div>`;

                            // Right side: Warranty Badge
                            if (p.warranty) {
                                pricingHtml += `
                                    <div class="pdp-warranty-badge" style="display: flex; align-items: center; gap: 8px; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 8px 12px; border-radius: var(--radius); box-shadow: var(--shadow-sm); flex-shrink: 0;">
                                        <div style="color: var(--success); display: flex; align-items: center; justify-content: center;">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 20px; height: 20px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                                        </div>
                                        <div style="display: flex; flex-direction: column;">
                                            <div style="font-size: 10px; color: var(--success); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; line-height: 1; margin-bottom: 3px;">Brand Warranty</div>
                                            <div style="font-size: 14px; font-weight: 800; color: var(--text-main); line-height: 1;">${p.warranty}</div>
                                        </div>
                                    </div>
                                `;
                            }

                            pricingHtml += `</div>`;
                            return pricingHtml;
                        })()}
                        
                        ${(() => {
                            let variantHtml = '';
                            if ((p.linked_product_ids && p.linked_product_ids.length > 0) || p.custom_options || (p.pack_qty && p.pack_price)) {
                                variantHtml += `<div class="variant-engine-container">`;
                                
                                // 1. Linked Products (Smart Link Engine)
                                if (p.linked_product_ids && p.linked_product_ids.length > 0) {
                                    const linkedProds = this.state.products.filter(x => p.linked_product_ids.includes(x.id));
                                    if (linkedProds.length > 0) {
                                        const allLinked = [p, ...linkedProds].sort((a,b) => a.selling_price - b.selling_price);
                                        variantHtml += `
                                            <div class="variant-group">
                                                <div class="variant-label">Available Variations</div>
                                                <div class="variant-pill-list">
                                                    ${allLinked.map(lp => {
                                                        let shortName = lp.name.length > 22 ? lp.name.substring(0, 22) + '...' : lp.name;
                                                        return `<a href="javascript:void(0)" onclick="Store.navigate('product', '${lp.id}')" class="variant-pill ${lp.id === p.id ? 'active' : ''}">${shortName}</a>`;
                                                    }).join('')}
                                                </div>
                                            </div>
                                        `;
                                    }
                                }

                                // 2. Custom Options (Colors, etc.)
                                if (p.custom_options) {
                                    const parts = p.custom_options.split(':');
                                    const label = parts.length > 1 ? parts[0].trim() : 'Options';
                                    const optionsStr = parts.length > 1 ? parts[1] : parts[0];
                                    const options = optionsStr.split(',').map(o => o.trim()).filter(o => o);
                                    
                                    if (options.length > 0) {
                                        variantHtml += `
                                            <div class="variant-group">
                                                <div class="variant-label">${label}</div>
                                                <div class="variant-pill-list" id="pdp-custom-options" data-label="${label}">
                                                    ${options.map((opt, i) => `
                                                        <div class="variant-pill ${i===0 ? 'active' : ''}" onclick="document.querySelectorAll('#pdp-custom-options .variant-pill').forEach(el=>el.classList.remove('active')); this.classList.add('active');" data-val="${opt}">${opt}</div>
                                                    `).join('')}
                                                </div>
                                            </div>
                                        `;
                                    }
                                }

                                // 3. Bulk Pack Engine (Multi-Tier)
                                const tiers = (p.bulk_packs && Array.isArray(p.bulk_packs) && p.bulk_packs.length > 0)
                                    ? p.bulk_packs
                                    : (p.pack_qty && p.pack_price ? [{ qty: p.pack_qty, price: p.pack_price }] : []);

                                if (tiers.length > 0) {
                                    const singlePrice = p.selling_price;
                                    variantHtml += `
                                        <div class="variant-group">
                                            <div class="variant-label">Package Size</div>
                                            <div class="variant-pill-list" id="pdp-pack-options">
                                                <div class="pack-pill active" onclick="document.querySelectorAll('#pdp-pack-options .pack-pill').forEach(el=>el.classList.remove('active')); this.classList.add('active');" data-ispack="false" data-qty="1" data-price="${singlePrice}">
                                                    <div class="pack-pill-title">Pack of 1</div>
                                                    <div class="pack-pill-price">₹${singlePrice}</div>
                                                    <div class="pack-pill-unit">₹${singlePrice.toFixed(2)} / count</div>
                                                </div>
                                                ${tiers.map(t => {
                                                    const packUnitCost = t.price / t.qty;
                                                    const savings = (singlePrice - packUnitCost) * t.qty;
                                                    return `
                                                        <div class="pack-pill" onclick="document.querySelectorAll('#pdp-pack-options .pack-pill').forEach(el=>el.classList.remove('active')); this.classList.add('active');" data-ispack="true" data-qty="${t.qty}" data-price="${t.price}">
                                                            <div class="pack-pill-title">Pack of ${t.qty}</div>
                                                            <div class="pack-pill-price">₹${t.price}</div>
                                                            <div class="pack-pill-unit">₹${packUnitCost.toFixed(2)} / count</div>
                                                            ${savings > 0 ? `<div class="pack-pill-save">Save ₹${savings.toFixed(2)}</div>` : ''}
                                                        </div>
                                                    `;
                                                }).join('')}
                                            </div>
                                        </div>
                                    `;
                                }

                                variantHtml += `</div>`;
                            }
                            return variantHtml;
                        })()}
                        
                        ${p.description ? `<div class="pdp-desc" style="margin-top: 16px;">${p.description.replace(/\n/g, '<br>')}</div>` : ''}
                        
                        ${(() => {
                            let crossSellHtml = '';
                            if (p.accessory_ids && p.accessory_ids.length > 0) {
                                const accessories = this.state.products.filter(x => p.accessory_ids.includes(x.id) && x.is_active);
                                if (accessories.length > 0) {
                                    crossSellHtml += `
                                        <div class="cross-sell-container">
                                            <div class="cross-sell-title">Frequently Bought Together</div>
                                            <div class="cross-sell-grid">
                                                ${accessories.map(acc => {
                                                    const img = acc.image_urls?.[0] || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" background="%23f1f5f9"></svg>';
                                                    return `
                                                        <div class="cross-sell-card">
                                                            <img src="${img}" class="cross-sell-img" alt="${acc.name}" onclick="Store.navigate('product', '${acc.id}')" style="cursor: pointer;">
                                                            <div class="cross-sell-name" onclick="Store.navigate('product', '${acc.id}')" style="cursor: pointer;" title="${acc.name}">${acc.name}</div>
                                                            <div class="cross-sell-price">₹${acc.selling_price}</div>
                                                            <button class="cross-sell-btn" onclick="Store.addToCart('${acc.id}')">+ Add</button>
                                                        </div>
                                                    `;
                                                }).join('')}
                                            </div>
                                        </div>
                                    `;
                                }
                            }
                            return crossSellHtml;
                        })()}

                        <button class="btn-add-cart-large" onclick="Store.handlePDPAddToCart('${p.id}')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
                            Add to Bag
                        </button>
                    </div>
                </div>
                ${relatedHtml}
            `;

            // Bind strict 1-swipe infinite loop logic via JS transforms
            if (totalImages > 1) {
                const track = document.getElementById('pdp-carousel');
                const dots = document.querySelectorAll('#pdp-dots .dot');
                
                let currentIndex = 1;
                let startX = 0;
                let currentTranslate = 0;
                let prevTranslate = 0;
                let isDragging = false;
                let trackWidth = track.clientWidth;

                const setPositionByIndex = () => {
                    trackWidth = track.clientWidth;
                    currentTranslate = currentIndex * -trackWidth;
                    prevTranslate = currentTranslate;
                    track.style.transform = `translateX(${currentTranslate}px)`;
                };

                const updateDots = () => {
                    let realIndex = currentIndex - 1;
                    if (realIndex < 0) realIndex = totalImages - 1;
                    if (realIndex >= totalImages) realIndex = 0;
                    dots.forEach((d, i) => d.classList.toggle('active', i === realIndex));
                };

                // Initialize without animation
                track.style.transition = 'none';
                setPositionByIndex();
                
                // Keep scaled correctly on orientation change (Garbage collects automatically)
                const resizeObserver = new ResizeObserver(() => {
                    track.style.transition = 'none';
                    setPositionByIndex();
                });
                resizeObserver.observe(track);

                const touchStart = (clientX) => {
                    isDragging = true;
                    startX = clientX;
                    trackWidth = track.clientWidth;
                    track.style.transition = 'none';
                };

                const touchMove = (clientX) => {
                    if (!isDragging) return;
                    const diff = clientX - startX;
                    track.style.transform = `translateX(${prevTranslate + diff}px)`;
                };

                const touchEnd = (clientX) => {
                    if (!isDragging) return;
                    isDragging = false;
                    const diff = clientX - startX;
                    
                    track.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
                    
                    // Strict "One Swipe = One Image" threshold constraint
                    if (diff < -40) currentIndex++;
                    else if (diff > 40) currentIndex--;
                    
                    setPositionByIndex();
                    updateDots();

                    // Infinite wrap reset hidden after animation finishes
                    setTimeout(() => {
                        if (currentIndex === 0) {
                            track.style.transition = 'none';
                            currentIndex = totalImages;
                            setPositionByIndex();
                        } else if (currentIndex === totalImages + 1) {
                            track.style.transition = 'none';
                            currentIndex = 1;
                            setPositionByIndex();
                        }
                    }, 300);
                };

                // Mobile Touch Events
                track.addEventListener('touchstart', (e) => touchStart(e.touches[0].clientX), { passive: true });
                track.addEventListener('touchmove', (e) => touchMove(e.touches[0].clientX), { passive: true });
                track.addEventListener('touchend', (e) => touchEnd(e.changedTouches[0].clientX));
                
                // Desktop Mouse Events
                track.addEventListener('mousedown', (e) => touchStart(e.clientX));
                track.addEventListener('mousemove', (e) => {
                    if (isDragging) { e.preventDefault(); touchMove(e.clientX); }
                });
                track.addEventListener('mouseup', (e) => touchEnd(e.clientX));
                track.addEventListener('mouseleave', (e) => touchEnd(e.clientX));
            }
        },

        openLightbox: function(imgSrc) {
            let lightbox = document.getElementById('product-lightbox');
            if (!lightbox) {
                lightbox = document.createElement('div');
                lightbox.id = 'product-lightbox';
                lightbox.innerHTML = `
                    <div class="lightbox-overlay" onclick="document.getElementById('product-lightbox').classList.add('hidden')"></div>
                    <div class="lightbox-content">
                        <button class="lightbox-close" onclick="document.getElementById('product-lightbox').classList.add('hidden')" title="Close">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                        <div class="panzoom-container" id="panzoom-container">
                            <img src="" id="lightbox-img">
                        </div>
                    </div>
                `;
                document.body.appendChild(lightbox);

                const imgEl = document.getElementById('lightbox-img');
                const container = document.getElementById('panzoom-container');

                // Advanced Pan & Zoom Logic (Amazon Style)
                let isZoomed = false;
                let lastTap = 0;
                let isDragging = false;
                let startX, startY;
                let translateX = 0, translateY = 0;
                const SCALE = 2.5;

                const resetZoom = () => {
                    isZoomed = false;
                    translateX = 0;
                    translateY = 0;
                    imgEl.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
                    imgEl.style.transform = 'translate(0px, 0px) scale(1)';
                    imgEl.style.cursor = 'zoom-in';
                };
                imgEl.resetZoom = resetZoom;

                imgEl.addEventListener('pointerdown', function(e) {
                    e.preventDefault(); 
                    const currentTime = new Date().getTime();
                    const tapLength = currentTime - lastTap;
                    
                    if (tapLength < 300 && tapLength > 0) {
                        // Double Tap / Double Click
                        if (!isZoomed) {
                            isZoomed = true;
                            imgEl.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
                            imgEl.style.transform = `translate(0px, 0px) scale(${SCALE})`;
                            imgEl.style.cursor = 'grab';
                        } else {
                            resetZoom();
                        }
                    } else {
                        // Single Tap / Start Drag
                        if (isZoomed) {
                            isDragging = true;
                            startX = e.clientX - translateX;
                            startY = e.clientY - translateY;
                            imgEl.style.transition = 'none'; // Remove transition for instant drag response
                            imgEl.style.cursor = 'grabbing';
                            imgEl.setPointerCapture(e.pointerId);
                        }
                    }
                    lastTap = currentTime;
                });

                imgEl.addEventListener('pointermove', function(e) {
                    if (!isDragging || !isZoomed) return;
                    e.preventDefault();
                    
                    // 1. Calculate raw user movement
                    let tx = e.clientX - startX;
                    let ty = e.clientY - startY;
                    
                    // 2. Mathematically calculate strict boundary walls based on current image size
                    const maxX = (imgEl.offsetWidth * (SCALE - 1)) / 2;
                    const maxY = (imgEl.offsetHeight * (SCALE - 1)) / 2;
                    
                    // 3. Force the image to stop at the walls using min/max constraints
                    translateX = Math.max(-maxX, Math.min(maxX, tx));
                    translateY = Math.max(-maxY, Math.min(maxY, ty));
                    
                    imgEl.style.transform = `translate(${translateX}px, ${translateY}px) scale(${SCALE})`;
                });

                imgEl.addEventListener('pointerup', function(e) {
                    if (!isDragging) return;
                    isDragging = false;
                    imgEl.style.cursor = 'grab';
                    imgEl.releasePointerCapture(e.pointerId);
                });

                // Ensure overlay clicks also reset zoom state
                document.querySelector('.lightbox-overlay').addEventListener('click', resetZoom);
                document.querySelector('.lightbox-close').addEventListener('click', resetZoom);
            }
            
            const imgEl = document.getElementById('lightbox-img');
            imgEl.src = imgSrc;
            if (imgEl.resetZoom) imgEl.resetZoom();
            lightbox.classList.remove('hidden');
        },

        shareProduct: async function(productId) {
            const p = this.state.products.find(x => x.id === productId);
            if (!p) return;
            
            const url = window.location.href;
            // Embed the URL directly in the text so it always appears alongside native image shares
            const shareText = `*${p.name}*\nRR ELECTRRIC — Branded Electrical Products\nSelling Price: ₹${p.selling_price}\n\nShop now: ${url}`;
            
            if (navigator.share) {
                try {
                    // Try to attach the actual product image natively as a file
                    if (p.image_urls && p.image_urls.length > 0 && navigator.canShare) {
                        const response = await fetch(p.image_urls[0]);
                        const blob = await response.blob();
                        const file = new File([blob], 'product-image.webp', { type: blob.type });
                        
                        if (navigator.canShare({ files: [file] })) {
                            await navigator.share({
                                title: `RR ELECTRRIC - ${p.name}`,
                                text: shareText,
                                files: [file]
                            });
                            return;
                        }
                    }
                    
                    // Fallback to standard text + url share if files aren't supported
                    await navigator.share({
                        title: `RR ELECTRRIC - ${p.name}`,
                        text: shareText
                    });
                } catch (err) {
                    console.warn('Share failed or cancelled:', err);
                }
            } else {
                // Fallback for desktop browsers
                navigator.clipboard.writeText(shareText).then(() => CustomUI.alert('Product info and link copied to clipboard!'));
            }
        },

        // --- PHASE 10: CART / BAG ---
        loadCart: function() {
            try {
                const stored = localStorage.getItem('rr_cart');
                if (stored) this.state.cart = JSON.parse(stored);
                this.state.appliedCouponCode = localStorage.getItem('rr_coupon') || null;
            } catch (e) {
                this.state.cart = [];
            }
            this.updateCartBadge();
        },

        saveCart: function() {
            localStorage.setItem('rr_cart', JSON.stringify(this.state.cart));
            if (this.state.appliedCouponCode) {
                localStorage.setItem('rr_coupon', this.state.appliedCouponCode);
            } else {
                localStorage.removeItem('rr_coupon');
            }
            this.updateCartBadge();
            if (document.getElementById('view-cart').classList.contains('hidden') === false) {
                this.renderCart();
            }
        },

        updateCartBadge: function() {
            const count = this.state.cart.reduce((sum, item) => sum + item.qty, 0);
            document.getElementById('cart-count').textContent = count;
            const mobileBadge = document.getElementById('mobile-cart-count');
            if (mobileBadge) mobileBadge.textContent = count;
        },

        addToCart: function(productId, packData = null, selectedOptions = null) {
            const p = this.state.products.find(x => x.id === productId);
            if (!p) return;
            
            const isPack = !!(packData && packData.isPack && packData.qty > 1);
            const packQty = isPack ? packData.qty : 1;
            const packPrice = isPack ? packData.price : null;
            
            // Unique cart key per variant tier and option
            const cartKey = `${productId}_${isPack ? `pack${packQty}` : 'single'}_${selectedOptions || 'none'}`;
            
            const existing = this.state.cart.find(x => x.cartKey === cartKey);
            if (existing) {
                existing.qty += 1;
            } else {
                this.state.cart.push({ 
                    id: productId, 
                    qty: 1, 
                    cartKey: cartKey,
                    isPack: isPack,
                    packQty: packQty,
                    packPrice: packPrice,
                    selectedOptions: selectedOptions
                });
            }
            
            this.saveCart();
            
            const badge = document.getElementById('cart-count');
            const mobileBadge = document.getElementById('mobile-cart-count');
            badge.style.transform = 'scale(1.5)';
            if (mobileBadge) mobileBadge.style.transform = 'scale(1.5)';
            
            setTimeout(() => {
                badge.style.transform = 'scale(1)';
                if (mobileBadge) mobileBadge.style.transform = 'scale(1)';
            }, 200);
        },

        handlePDPAddToCart: function(productId) {
            let packData = { isPack: false, qty: 1, price: 0 };
            let selectedOptions = null;
            
            const packContainer = document.getElementById('pdp-pack-options');
            if (packContainer) {
                const activePack = packContainer.querySelector('.pack-pill.active');
                if (activePack && activePack.dataset.ispack === 'true') {
                    packData = {
                        isPack: true,
                        qty: parseInt(activePack.dataset.qty),
                        price: parseFloat(activePack.dataset.price)
                    };
                }
            }
            
            const optionsContainer = document.getElementById('pdp-custom-options');
            if (optionsContainer) {
                const activeOption = optionsContainer.querySelector('.variant-pill.active');
                if (activeOption) {
                    const label = optionsContainer.dataset.label || 'Option';
                    selectedOptions = `${label}: ${activeOption.dataset.val}`;
                }
            }
            
            this.addToCart(productId, packData, selectedOptions);
        },

        updateCartQty: function(cartKey, delta) {
            const item = this.state.cart.find(x => x.cartKey === cartKey || x.id === cartKey); // Fallback for old storage
            if (!item) return;
            
            item.qty += delta;
            if (item.qty <= 0) {
                this.state.cart = this.state.cart.filter(x => (x.cartKey || x.id) !== (item.cartKey || item.id));
            }
            this.saveCart();
        },

        removeFromCart: function(cartKey) {
            this.state.cart = this.state.cart.filter(x => (x.cartKey || x.id) !== cartKey);
            this.saveCart();
        },

        clearCart: async function() {
            if (!await CustomUI.confirm("Remove all items from your bag?", "Clear Bag")) return;
            this.state.cart = [];
            this.state.appliedCouponCode = null;
            this.saveCart();
        },

        applyCoupon: async function() {
            const input = document.getElementById('coupon-input');
            const errorMsg = document.getElementById('coupon-error-msg');
            const code = input.value.trim().toUpperCase();
            
            if (!code) {
                errorMsg.textContent = "Please enter a coupon code.";
                errorMsg.classList.remove('hidden');
                return;
            }
            
            // Clear old errors before checking
            errorMsg.classList.add('hidden');
            const btn = input.nextElementSibling;
            btn.textContent = '...';
            btn.disabled = true;

            try {
                // True Server-Side Verification via Edge Function
                const { data, error } = await supabase.functions.invoke('validate-coupon', {
                    body: { code: code }
                });

                if (error) throw error;
                if (data?.error) throw new Error(data.error);

                // Store securely in memory for calculation
                this.state.coupons = [data.coupon]; 
                this.state.appliedCouponCode = code;
                this.saveCart();

            } catch (err) {
                let displayMsg = err.message || "Invalid coupon code.";
                // Catch any remaining generic network errors
                if (displayMsg.includes("non-2xx") || displayMsg.includes("Edge Function")) {
                    displayMsg = "Invalid coupon code or criteria not met.";
                }
                errorMsg.textContent = displayMsg;
                errorMsg.classList.remove('hidden');
            } finally {
                btn.textContent = 'Apply';
                btn.disabled = false;
            }
        },

        removeCoupon: function() {
            this.state.appliedCouponCode = null;
            this.saveCart();
        },

        calculateTotals: function() {
            let mrpSubtotal = 0;
            let sellingSubtotal = 0;
            const validItems = [];

            // 1. Base price calculation (Trusting only state.products, NOT local storage)
            this.state.cart.forEach(item => {
                const product = this.state.products.find(p => p.id === item.id);
                if (product) {
                    const isPack = item.isPack && item.packQty > 1 && item.packPrice;
                    const packQty = isPack ? item.packQty : 1;
                    const baseMrp = (product.mrp_price && product.mrp_price > product.selling_price) ? product.mrp_price : product.selling_price;
                    
                    const unitPrice = isPack ? item.packPrice : product.selling_price;
                    const unitMrp = isPack ? (baseMrp * packQty) : baseMrp;
                    
                    mrpSubtotal += unitMrp * item.qty;
                    sellingSubtotal += unitPrice * item.qty;
                    
                    validItems.push({ 
                        ...product, 
                        qty: item.qty, 
                        cartKey: item.cartKey || item.id,
                        isPack: isPack,
                        pack_qty: packQty,
                        selectedOptions: item.selectedOptions,
                        calculatedPrice: unitPrice,
                        calculatedMrp: unitMrp
                    });
                }
            });

            const productDiscount = mrpSubtotal - sellingSubtotal;

            // 2. VIP Logic (Live Server-Synced Evaluation & Next-Tier Progress)
            let vipDiscount = 0;
            let appliedVipName = null;
            let nextVipTier = null;
            
            // Sort tiers ascending by min_spend to find current qualification and next target
            const sortedVips = [...this.state.vipTiers].sort((a, b) => a.min_spend - b.min_spend);
            
            let qualifiedVip = null;
            for (const v of sortedVips) {
                if (sellingSubtotal >= v.min_spend) {
                    qualifiedVip = v; // Keeps upgrading to the highest tier qualified for
                } else if (!nextVipTier) {
                    nextVipTier = v; // The very next tier above current spend
                }
            }

            if (qualifiedVip) {
                vipDiscount = (sellingSubtotal * qualifiedVip.discount_percentage) / 100;
                appliedVipName = qualifiedVip.name.replace(/\*\*/g, '').trim();
            }

            let vipProgressMsg = null;
            if (nextVipTier && sellingSubtotal > 0) {
                const diff = nextVipTier.min_spend - sellingSubtotal;
                if (diff > 0) {
                    const cleanName = nextVipTier.name.replace(/\*\*/g, '').trim();
                    vipProgressMsg = `Add <b style="color:var(--text-main);">₹${diff.toFixed(2)}</b> for <b>${cleanName}</b>`;
                }
            } else if (!qualifiedVip && sortedVips.length > 0 && sellingSubtotal > 0) {
                const firstVip = sortedVips[0];
                const diff = firstVip.min_spend - sellingSubtotal;
                if (diff > 0) {
                    const cleanName = firstVip.name.replace(/\*\*/g, '').trim();
                    vipProgressMsg = `Add <b style="color:var(--text-main);">₹${diff.toFixed(2)}</b> for <b>${cleanName}</b>`;
                }
            }

            // 3. Coupon Logic
            let couponDiscount = 0;
            let appliedCouponObj = null;
            let couponMsg = null;

            if (this.state.appliedCouponCode) {
                const coupon = this.state.coupons.find(c => c.code === this.state.appliedCouponCode);
                if (coupon) {
                    if (sellingSubtotal >= (coupon.min_cart_value || 0)) {
                        if (coupon.discount_type === 'PERCENTAGE') {
                            couponDiscount = (sellingSubtotal * coupon.discount_amount) / 100;
                            if (coupon.max_discount && couponDiscount > coupon.max_discount) {
                                couponDiscount = coupon.max_discount;
                            }
                        } else {
                            couponDiscount = coupon.discount_amount;
                            if (couponDiscount > sellingSubtotal) couponDiscount = sellingSubtotal;
                        }
                        appliedCouponObj = coupon;
                    } else {
                        couponMsg = `Add ₹${(coupon.min_cart_value - sellingSubtotal).toFixed(2)} more to use this coupon.`;
                    }
                }
            }

            const discountedSubtotal = Math.max(0, sellingSubtotal - vipDiscount - couponDiscount);
            
            // Phase 3 Delivery & Minimum Order Engine
            const deliveryConfig = this.state.config.deliverySettings || {};
            const minOrder = parseFloat(deliveryConfig.min_order) || 0;
            const freeAbove = parseFloat(deliveryConfig.free_above) || 0;
            const baseCharge = parseFloat(deliveryConfig.charge) || 0;

            const isBelowMinOrder = discountedSubtotal > 0 && discountedSubtotal < minOrder;
            const remainingForMinOrder = isBelowMinOrder ? (minOrder - discountedSubtotal) : 0;

            let deliveryCharge = 0;
            let isFreeDelivery = false;
            let remainingForFreeDelivery = 0;

            if (discountedSubtotal >= freeAbove && freeAbove > 0) {
                isFreeDelivery = true;
            } else {
                deliveryCharge = baseCharge;
                if (freeAbove > 0) {
                    remainingForFreeDelivery = freeAbove - discountedSubtotal;
                }
            }

            const finalTotal = discountedSubtotal > 0 ? discountedSubtotal + deliveryCharge : 0;

            return {
                validItems,
                subtotal: mrpSubtotal,
                sellingSubtotal,
                productDiscount,
                vipDiscount,
                appliedVipName,
                vipProgressMsg,
                couponDiscount,
                appliedCouponObj,
                couponMsg,
                discountedSubtotal,
                deliveryCharge,
                isFreeDelivery,
                minOrder,
                isBelowMinOrder,
                remainingForMinOrder,
                remainingForFreeDelivery,
                total: finalTotal
            };
        },

        renderCart: function() {
            const container = document.getElementById('cart-content');
            
            if (this.state.cart.length === 0) {
                container.innerHTML = `
                    <div style="text-align:center; padding: 60px 16px; width:100%;">
                        <div style="margin-bottom:16px; color: var(--border-focus);">
                            <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto;"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
                        </div>
                        <h2 style="margin-bottom: 8px;">Your bag is empty</h2>
                        <p style="color: var(--text-muted); margin-bottom: 24px;">Looks like you haven't added any items yet.</p>
                        <button class="btn-checkout" onclick="Store.navigate('home')" style="width: auto; padding: 12px 32px; display:inline-block;">Start Shopping</button>
                    </div>
                `;
                document.getElementById('cart-recommendations').classList.add('hidden');
                return;
            }

            const totals = this.calculateTotals();
            
            // Render Items
            const itemsHtml = totals.validItems.map(item => {
                const img = item.image_urls?.[0] || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" background="%23f1f5f9"></svg>';
                const mrpHtml = (item.calculatedMrp && item.calculatedMrp > item.calculatedPrice) 
                    ? `<span style="font-size: 13px; color: var(--text-muted); margin-left: 8px; font-weight: normal;">MRP <span style="text-decoration: line-through;">₹${item.calculatedMrp}</span></span>` 
                    : '';
                    
                // Append Pack Label & Options to Title
                let displayName = item.name;
                if (item.isPack) displayName += ` <span style="color:var(--primary); font-weight:800; font-size:11px; background:rgba(34,211,238,0.1); padding:3px 6px; border-radius:4px; margin-left:6px; display:inline-block; vertical-align:middle;">Pack of ${item.pack_qty}</span>`;
                if (item.selectedOptions) displayName += ` <div style="font-size:12px; color:var(--text-muted); margin-top:4px; font-weight:600;">${item.selectedOptions}</div>`;
                
                return `
                    <div class="cart-item">
                        <img src="${img}" class="cart-item-img" alt="${item.name}">
                        <div class="cart-item-details">
                            <div class="cart-item-title" style="line-height:1.4;">${displayName}</div>
                            <div class="cart-item-price">₹${item.calculatedPrice} ${mrpHtml}</div>
                            <div class="cart-qty-row">
                                <div class="cart-qty-controls">
                                    <button class="cart-qty-btn" aria-label="Decrease quantity" onclick="Store.updateCartQty('${item.cartKey}', -1)">
                                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                    </button>
                                    <div class="cart-qty-val">${item.qty}</div>
                                    <button class="cart-qty-btn" aria-label="Increase quantity" onclick="Store.updateCartQty('${item.cartKey}', 1)">
                                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                    </button>
                                </div>
                                <button class="cart-remove-btn" aria-label="Remove item" onclick="Store.removeFromCart('${item.cartKey}')">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    Remove
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            // Render Coupon Section
            let couponHtml = '';
            if (totals.appliedCouponObj) {
                couponHtml = `
                    <div class="applied-coupon">
                        <span style="display: flex; align-items: center; gap: 6px;">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
                            ${totals.appliedCouponObj.code} Applied
                        </span>
                        <button onclick="Store.removeCoupon()" title="Remove Coupon">&times;</button>
                    </div>
                `;
            } else {
                couponHtml = `
                    <div class="coupon-area" style="margin-bottom: 8px;">
                        <input type="text" id="coupon-input" placeholder="Coupon Code" value="${this.state.appliedCouponCode || ''}" oninput="document.getElementById('coupon-error-msg').classList.add('hidden')">
                        <button onclick="Store.applyCoupon()">Apply</button>
                    </div>
                    <div id="coupon-error-msg" class="hidden" style="color: var(--danger); font-size: 13px; margin-bottom: 24px; font-weight: 500;"></div>
                    ${totals.couponMsg ? `<div style="color:var(--warning); font-size:13px; margin-bottom:24px; font-weight: 500;">${totals.couponMsg}</div>` : ''}
                `;
            }

            // Render Summary
            const summaryHtml = `
                <div class="cart-summary">
                    <h3 style="margin-bottom: 16px; font-size:16px;">Order Summary</h3>
                    ${couponHtml}
                    <div class="summary-row">
                        <span>Subtotal (MRP)</span>
                        <span>₹${totals.subtotal.toFixed(2)}</span>
                    </div>
                    ${totals.productDiscount > 0 ? `
                        <div class="summary-row discount-text">
                            <span>Product Discount (MRP Savings)</span>
                            <span>-₹${totals.productDiscount.toFixed(2)}</span>
                        </div>
                    ` : ''}
                    <div class="summary-row" style="font-weight: 600; color: var(--text-main);">
                        <span>RR Price</span>
                        <span>₹${totals.sellingSubtotal.toFixed(2)}</span>
                    </div>
                    <div class="summary-row ${totals.vipDiscount > 0 ? 'discount-text' : ''}">
                        <span>VIP Discount ${totals.appliedVipName ? `(${totals.appliedVipName})` : ''}</span>
                        <span>-₹${totals.vipDiscount.toFixed(2)}</span>
                    </div>
                    <div class="summary-row ${totals.couponDiscount > 0 ? 'discount-text' : ''}">
                        <span>Coupon Discount ${totals.appliedCouponObj ? `(${totals.appliedCouponObj.code})` : ''}</span>
                        <span>-₹${totals.couponDiscount.toFixed(2)}</span>
                    </div>
                    <div class="summary-row">
                        <span>Delivery Charge</span>
                        <span style="${totals.isFreeDelivery || totals.deliveryCharge === 0 ? 'color: var(--success); font-weight: 600;' : 'color: var(--text-main);'}">${totals.isFreeDelivery || totals.deliveryCharge === 0 ? 'FREE' : '₹' + totals.deliveryCharge.toFixed(2)}</span>
                    </div>
                    <div class="summary-row total">
                        <span>Final Total</span>
                        <span>₹${totals.total.toFixed(2)}</span>
                    </div>
                    <button class="btn-checkout" ${totals.isBelowMinOrder ? 'disabled style="opacity: 0.5; cursor: not-allowed; background: var(--text-muted);"' : ''} onclick="${totals.isBelowMinOrder ? '' : "Store.navigate('checkout')"}">
                        ${totals.isBelowMinOrder ? 'Minimum Order Not Reached' : 'Proceed to Checkout'}
                    </button>
                </div>
            `;

            let bannerStack = [];
            
            if (totals.isBelowMinOrder && totals.minOrder > 0) {
                bannerStack.push(`<div style="background: #fee2e2; color: #dc2626; padding: 10px 12px; border-radius: 6px; font-size: 13px; font-weight: 600; text-align: center; margin-bottom: 12px; border: 1px solid #fecaca;">Add ₹${totals.remainingForMinOrder.toFixed(2)} more to place this order (Minimum ₹${totals.minOrder}).</div>`);
            } else {
                // Free Delivery Check (Always show first if not met)
                if (!totals.isFreeDelivery && totals.remainingForFreeDelivery > 0) {
                    bannerStack.push(`<div style="background: #e0f2fe; color: #0369a1; padding: 10px 12px; border-radius: 6px; font-size: 13px; font-weight: 600; text-align: center; margin-bottom: 12px; border: 1px solid #bae6fd;">Add ₹${totals.remainingForFreeDelivery.toFixed(2)} more for FREE delivery!</div>`);
                }

                // VIP Checks (Pushed directly below Free Delivery)
                if (totals.appliedVipName) {
                    const nextTierText = totals.vipProgressMsg ? `<div style="font-size: 11px; margin-top: 4px; color: #a16207; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${totals.vipProgressMsg}</div>` : '';
                    bannerStack.push(`
                        <style>
                            @keyframes vip-unlock-pulse {
                                0% { box-shadow: 0 0 0 0 rgba(234, 179, 8, 0.4); }
                                70% { box-shadow: 0 0 0 8px rgba(234, 179, 8, 0); }
                                100% { box-shadow: 0 0 0 0 rgba(234, 179, 8, 0); }
                            }
                        </style>
                        <div style="background: #fefce8; color: #854d0e; padding: 10px 12px; border-radius: 6px; border: 1px solid #fde047; animation: vip-unlock-pulse 2s infinite; display: flex; flex-direction: column; justify-content: center; margin-bottom: 12px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 16px; flex-shrink: 0;">🎉</span>
                                <span style="font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;"><b>${totals.appliedVipName}</b> unlocked!</span>
                            </div>
                            ${nextTierText}
                        </div>
                    `);
                } else if (totals.vipProgressMsg) {
                    bannerStack.push(`
                        <div style="background: #f0fdf4; color: #15803d; padding: 10px 12px; border-radius: 6px; border: 1px solid #bbf7d0; display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
                            <span style="font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;">${totals.vipProgressMsg}</span>
                        </div>
                    `);
                }
            }
            
            let deliveryBannerHtml = bannerStack.length > 0 ? `<div style="margin-bottom: 4px;">${bannerStack.join('')}</div>` : '';

            container.innerHTML = `
                <div class="cart-items-section">
                    ${deliveryBannerHtml}
                    <div class="cart-items-scroll">
                        ${itemsHtml}
                    </div>
                </div>
                <div class="cart-summary-section">
                    ${summaryHtml}
                </div>
            `;

            // Recommendation Engine (Products matching cart categories, not currently in cart)
            const cartCatIds = [...new Set(totals.validItems.map(x => x.category_id))];
            const cartItemIds = totals.validItems.map(x => x.id);
            const recs = this.state.products
                .filter(p => cartCatIds.includes(p.category_id) && !cartItemIds.includes(p.id))
                .slice(0, 4);

            const recSection = document.getElementById('cart-recommendations');
            if (recs.length > 0) {
                document.getElementById('cart-recs-grid').innerHTML = recs.map(p => this.generateProductCardHTML(p)).join('');
                recSection.classList.remove('hidden');
            } else {
                recSection.classList.add('hidden');
            }
        },

        // --- PHASE 11: CHECKOUT ---
        loadCustomerInfo: function() {
            try {
                const stored = localStorage.getItem('rr_customer');
                if (stored) this.state.customerInfo = JSON.parse(stored);
            } catch (e) {
                this.state.customerInfo = {};
            }
        },

        saveCustomerInfo: function(info) {
            this.state.customerInfo = info;
            localStorage.setItem('rr_customer', JSON.stringify(info));
        },

        renderCheckout: function() {
            if (this.state.cart.length === 0) {
                this.navigate('cart');
                return;
            }

            // Pre-fill form from saved details
            const info = this.state.customerInfo;
            document.getElementById('checkout-name').value = info.name || '';
            document.getElementById('checkout-phone').value = info.phone || '';
            document.getElementById('checkout-area').value = info.area || '';
            document.getElementById('checkout-address').value = info.address || '';
            document.getElementById('checkout-landmark').value = info.landmark || '';
            document.getElementById('checkout-note').value = ''; // Note is strictly per order

            const totals = this.calculateTotals();
            const summaryContainer = document.getElementById('checkout-summary-container');

            let itemsHtml = totals.validItems.map(item => {
                const itemTotal = (item.calculatedPrice * item.qty).toFixed(2);
                const mrpHtml = (item.calculatedMrp && item.calculatedMrp > item.calculatedPrice) 
                    ? `<span style="font-size: 11px; color: var(--text-muted); margin-left: 6px; font-weight: normal;">MRP <span style="text-decoration: line-through;">₹${(item.calculatedMrp * item.qty).toFixed(2)}</span></span>` 
                    : '';
                
                let displayName = item.name;
                if (item.isPack) displayName += ` <span style="color:var(--primary); font-weight:800; font-size:10px; background:rgba(34,211,238,0.1); padding:2px 6px; border-radius:4px; margin-left:6px; display:inline-block; vertical-align:middle;">Pack of ${item.pack_qty}</span>`;
                if (item.selectedOptions) displayName += ` <div style="font-size:12px; color:var(--text-muted); margin-top:4px; font-weight:600;">${item.selectedOptions}</div>`;
                
                const img = item.image_urls?.[0] || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" background="%23f1f5f9"></svg>';

                return `
                <div style="display: flex; gap: 12px; align-items: center; padding: 10px 0; border-bottom: 1px dashed var(--border);">
                    <img src="${img}" style="width: 48px; height: 48px; object-fit: contain; background: #ffffff; border: 1px solid var(--border); border-radius: 6px; flex-shrink: 0; padding: 2px;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 13px; font-weight: 600; color: var(--text-main); line-height: 1.4; margin-bottom: 4px;">${item.qty} × ${displayName}</div>
                        <div style="font-size: 14px; font-weight: 700; color: var(--text-main);">₹${itemTotal} ${mrpHtml}</div>
                    </div>
                </div>
                `;
            }).join('');

            summaryContainer.innerHTML = `
                <h3 style="margin-bottom: 16px; font-size:16px;">Order Summary</h3>
                <div style="margin-bottom: 16px; max-height: 200px; overflow-y: auto;">
                    ${itemsHtml}
                </div>
                <div class="summary-row">
                    <span>Subtotal (MRP)</span>
                    <span>₹${totals.subtotal.toFixed(2)}</span>
                </div>
                ${totals.productDiscount > 0 ? `
                    <div class="summary-row discount-text">
                        <span>Product Discount (MRP Savings)</span>
                        <span>-₹${totals.productDiscount.toFixed(2)}</span>
                    </div>
                ` : ''}
                <div class="summary-row" style="font-weight: 600; color: var(--text-main);">
                    <span>RR Price</span>
                    <span>₹${totals.sellingSubtotal.toFixed(2)}</span>
                </div>
                <div class="summary-row ${totals.vipDiscount > 0 ? 'discount-text' : ''}">
                    <span>VIP Discount ${totals.appliedVipName ? `(${totals.appliedVipName})` : ''}</span>
                    <span>-₹${totals.vipDiscount.toFixed(2)}</span>
                </div>
                <div class="summary-row ${totals.couponDiscount > 0 ? 'discount-text' : ''}">
                    <span>Coupon Discount ${totals.appliedCouponObj ? `(${totals.appliedCouponObj.code})` : ''}</span>
                    <span>-₹${totals.couponDiscount.toFixed(2)}</span>
                </div>
                <div class="summary-row">
                    <span>Delivery Charge</span>
                    <span style="${totals.isFreeDelivery || totals.deliveryCharge === 0 ? 'color: var(--success); font-weight: 600;' : 'color: var(--text-main);'}">${totals.isFreeDelivery || totals.deliveryCharge === 0 ? 'FREE' : '₹' + totals.deliveryCharge.toFixed(2)}</span>
                </div>
                <div class="summary-row total" style="margin-bottom: 24px;">
                    <span>Final Total</span>
                    <span>₹${totals.total.toFixed(2)}</span>
                </div>
                
                <div id="checkout-error" class="hidden" style="color: var(--danger); font-size: 14px; margin-bottom: 16px; padding: 12px; background: #fee2e2; border-radius: 4px;"></div>
                
                <button type="submit" form="checkout-form" class="btn-checkout" style="margin-top: 0;" id="btn-submit-order">Confirm Order & WhatsApp</button>
                <p style="text-align: center; font-size: 12px; color: var(--text-muted); margin-top: 12px;">Payment method will be decided via WhatsApp after confirmation.</p>
            `;

            // Bind submit event safely (removing previous to prevent duplicates)
            const form = document.getElementById('checkout-form');
            form.onsubmit = (e) => this.submitCheckout(e);
        },

        submitCheckout: async function(e) {
            e.preventDefault();
            
            const btn = document.getElementById('btn-submit-order');
            const errorEl = document.getElementById('checkout-error');
            errorEl.classList.add('hidden');

            const customerData = {
                name: document.getElementById('checkout-name').value.trim(),
                phone: document.getElementById('checkout-phone').value.trim(),
                area: document.getElementById('checkout-area').value.trim(),
                address: document.getElementById('checkout-address').value.trim(),
                landmark: document.getElementById('checkout-landmark').value.trim(),
                note: document.getElementById('checkout-note').value.trim()
            };

            if (customerData.phone.length !== 10 || isNaN(customerData.phone)) {
                errorEl.textContent = "Please enter a valid 10-digit mobile number.";
                errorEl.classList.remove('hidden');
                return;
            }

            this.saveCustomerInfo({
                name: customerData.name,
                phone: customerData.phone,
                area: customerData.area,
                address: customerData.address,
                landmark: customerData.landmark
            });

            btn.disabled = true;
            btn.textContent = 'Processing Securely...';

            try {
                // Generate idempotency key to prevent double charging on accidental double taps
                const idempotencyKey = Date.now().toString() + '-' + Math.random().toString(36).substring(2, 9);
                
                const clientTotals = this.calculateTotals();

                const { data, error } = await supabase.functions.invoke('create-order', {
                    body: {
                        customer: customerData,
                        cart: this.state.cart,
                        couponCode: this.state.appliedCouponCode,
                        expectedTotal: clientTotals.total,
                        idempotencyKey: idempotencyKey
                    }
                });

                if (error) throw error;
                if (data.error) throw new Error(data.error);

                // Keep button disabled to prevent resubmission
                btn.textContent = 'Processing Securely...';

                // 1. CREATE SUCCESS ANIMATION OVERLAY
                const overlay = document.createElement('div');
                overlay.id = 'order-success-overlay';
                overlay.innerHTML = `
                    <style>
                        @keyframes popInSuccess { 0% { transform: scale(0.5); opacity: 0; } 70% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
                        @keyframes slideUpFade { 0% { transform: translateY(20px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
                    </style>
                    <div style="position: fixed; inset: 0; background: rgba(255,255,255,0.98); z-index: 99999; display: flex; flex-direction: column; align-items: center; justify-content: center; backdrop-filter: blur(10px);">
                        <div style="width: 80px; height: 80px; border-radius: 50%; background: #22c55e; display: flex; align-items: center; justify-content: center; margin-bottom: 24px; animation: popInSuccess 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; box-shadow: 0 10px 25px -5px rgba(34,197,94,0.4);">
                            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                        <h2 style="font-size: 26px; font-weight: 800; color: var(--text-main); margin-bottom: 12px; animation: slideUpFade 0.6s ease 0.2s forwards; opacity: 0;">Order Placed!</h2>
                        <p style="color: var(--text-muted); font-size: 15px; font-weight: 500; animation: slideUpFade 0.6s ease 0.3s forwards; opacity: 0;">Redirecting to WhatsApp for confirmation...</p>
                    </div>
                `;
                document.body.appendChild(overlay);

                // Clear Cart
                this.state.cart = [];
                this.state.appliedCouponCode = null;
                this.saveCart();

                // Wait 2.5 seconds, then send to WhatsApp and route home
                setTimeout(() => {
                    this.sendWhatsAppOrder(data.order_reference, customerData, clientTotals);
                    document.body.removeChild(overlay);
                    this.navigate('home');
                }, 2500);

            } catch (err) {
                console.error("Order Creation Error:", err);
                let displayMsg = err.message || "Failed to process order securely. Please check your connection and try again.";
                if (displayMsg.includes("non-2xx") || displayMsg.includes("Edge Function")) {
                    displayMsg = "Failed to verify order details securely. Please try again.";
                }
                errorEl.textContent = displayMsg;
                errorEl.classList.remove('hidden');
                btn.disabled = false;
                btn.textContent = 'Confirm Order & WhatsApp';
            }
        },

        sendWhatsAppOrder: function(orderRef, customer, clientTotals, serverReceipt) {
            const storeName = this.state.config.storeInfo?.name || 'RR ELECTRRIC';
            let phone = this.state.config.storeInfo?.whatsapp || '';
            
            // Clean phone number (strip everything except digits)
            phone = phone.replace(/[^0-9]/g, '');
            if (!phone) {
                console.error("Store WhatsApp number not configured in Admin!");
                alert("Order saved, but the store's WhatsApp number is missing. Please contact the store directly.");
                return;
            }

            let msg = `*${storeName.toUpperCase()}*\n`;
            msg += `Electrical Products • Nadiad\n\n`;
            
            msg += `*ORDER REQUEST*\n`;
            msg += `Order ID: ${orderRef}\n\n`;
            
            msg += `*Customer:*\n`;
            msg += `Name: ${customer.name}\n`;
            msg += `Mobile: ${customer.phone}\n`;
            msg += `Address: ${customer.address}\n`;
            msg += `Area: ${customer.area}\n`;
            if (customer.landmark) msg += `Landmark: ${customer.landmark}\n`;
            if (customer.note) msg += `Note: ${customer.note}\n`;
            
            msg += `\n*ITEMS:*\n`;
            clientTotals.validItems.forEach(item => {
                let displayName = item.name;
                if (item.isPack) displayName += ` (Pack of ${item.pack_qty})`;
                
                msg += `${item.qty} × ${displayName}\n`;
                if (item.selectedOptions) msg += `   ↳ ${item.selectedOptions}\n`;
                msg += `₹${item.calculatedPrice} each\n\n`;
            });

            // Use Server Receipt for Authoritative Financials
            const finalSubtotal = serverReceipt ? serverReceipt.subtotal : clientTotals.sellingSubtotal;
            const finalVip = serverReceipt ? serverReceipt.vip_discount : clientTotals.vipDiscount;
            const finalVipName = serverReceipt ? serverReceipt.applied_vip_name : clientTotals.appliedVipName;
            const finalCoupon = serverReceipt ? serverReceipt.coupon_discount : clientTotals.couponDiscount;
            const finalDelivery = serverReceipt ? serverReceipt.delivery_charge : clientTotals.deliveryCharge;
            const finalTotalAmt = serverReceipt ? (finalSubtotal - finalVip - finalCoupon + finalDelivery) : clientTotals.total;

            msg += `*Subtotal:* ₹${finalSubtotal.toFixed(2)}\n`;
            if (clientTotals.productDiscount > 0) msg += `*Product Discount:* -₹${clientTotals.productDiscount.toFixed(2)}\n`;
            if (finalVip > 0) msg += `*VIP (${finalVipName || 'Discount'}):* -₹${finalVip.toFixed(2)}\n`;
            if (finalCoupon > 0) msg += `*Coupon:* -₹${finalCoupon.toFixed(2)}\n`;
            msg += `*Delivery:* ${finalDelivery === 0 ? 'FREE' : '₹' + finalDelivery.toFixed(2)}\n`;
            msg += `*TOTAL:* ₹${finalTotalAmt.toFixed(2)}\n\n`;
            
            msg += `*Delivery:* Nadiad\n\n`;
            msg += `Please confirm the order and payment method (UPI / COD).`;

            const encodedMsg = encodeURIComponent(msg);
            const waUrl = `https://wa.me/${phone}?text=${encodedMsg}`;
            
            // Open WhatsApp in a new tab/app window
            window.open(waUrl, '_blank');
        }
    };
    
    // Attach to window so inline HTML onclicks can reach it
    window.Store = Store;
    
    document.addEventListener('DOMContentLoaded', () => Store.init());
})();