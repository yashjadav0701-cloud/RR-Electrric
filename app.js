(function() {
    'use strict';

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

        init: async function() {
            CustomUI.init();
            this._initStartTime = Date.now();
            document.getElementById('year').textContent = new Date().getFullYear();
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

            // Hide preloader after initial load (minimum 3 seconds)
            const elapsed = Date.now() - this._initStartTime;
            const remainingTime = Math.max(0, 3000 - elapsed);
            
            setTimeout(() => {
                const preloader = document.getElementById('global-preloader');
                if (preloader) preloader.classList.add('hidden');
            }, remainingTime);
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
                        
                        const matches = this.state.products.filter(p => {
                            const nameMatch = p.name.toLowerCase().includes(q);
                            const catMatch = (p.categories?.name || '').toLowerCase().includes(q);
                            return nameMatch || catMatch;
                        });
                        
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
                this.state.vipTiers = vipRes.data || [];
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
                // 1. Shuffle all products randomly on each refresh
                for (let i = sorted.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
                }
                
                // 2. Bring items matching the last search to the top
                const lastSearch = localStorage.getItem('rr_last_search');
                if (lastSearch) {
                    const q = lastSearch.toLowerCase();
                    sorted.sort((a, b) => {
                        const aMatch = (a.name.toLowerCase().includes(q) || (a.categories?.name || '').toLowerCase().includes(q)) ? 1 : 0;
                        const bMatch = (b.name.toLowerCase().includes(q) || (b.categories?.name || '').toLowerCase().includes(q)) ? 1 : 0;
                        return bMatch - aMatch; // Pushes matches (1) above non-matches (0)
                    });
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
            
            const matches = this.state.products.filter(p => {
                const nameMatch = p.name.toLowerCase().includes(q);
                const catMatch = (p.categories?.name || '').toLowerCase().includes(q);
                return nameMatch || catMatch;
            });
            
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
                slidesHtml += `<div class="carousel-slide clone"><img src="${images[totalImages - 1]}" alt="${p.name}"></div>`;
            }

            images.forEach((url, i) => {
                slidesHtml += `<div class="carousel-slide"><img src="${url}" alt="${p.name}"></div>`;
                if (totalImages > 1) {
                    dotsHtml += `<div class="dot ${i === 0 ? 'active' : ''}" data-index="${i}"></div>`;
                }
            });

            if (totalImages > 1) {
                // Clone first image for infinite loop end
                slidesHtml += `<div class="carousel-slide clone"><img src="${images[0]}" alt="${p.name}"></div>`;
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
                            let offHtml = '';
                            if (p.mrp_price && p.mrp_price > p.selling_price) {
                                const off = Math.round(((p.mrp_price - p.selling_price) / p.mrp_price) * 100);
                                offHtml = `<span style="color: var(--danger); font-weight: 800; font-size: 20px;">${off}% OFF</span>`;
                            }
                            
                            let pricingHtml = `<div style="margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid var(--border);">`;

                            // 1. Primary Row: Huge RR Price + Discount Badge
                            pricingHtml += `<div style="display: flex; align-items: center; gap: 12px; margin-bottom: 6px;">`;
                            pricingHtml += `<div style="font-size: 32px; font-weight: 800; color: var(--text-main); line-height: 1;">₹${p.selling_price}</div>`;
                            
                            if (p.mrp_price && p.mrp_price > p.selling_price) {
                                const off = Math.round(((p.mrp_price - p.selling_price) / p.mrp_price) * 100);
                                pricingHtml += `<div style="background: #fee2e2; color: #dc2626; padding: 4px 8px; border-radius: 4px; font-weight: 800; font-size: 14px; line-height: 1;">${off}% OFF</div>`;
                            }
                            pricingHtml += `</div>`;

                            // 2. Secondary Row: Clean text comparisons (MRP)
                            if (p.mrp_price && p.mrp_price > p.selling_price) {
                                pricingHtml += `<div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 14px; color: var(--text-muted); font-weight: 500;">`;
                                pricingHtml += `<div>MRP <span style="text-decoration: line-through;">₹${p.mrp_price}</span></div>`;
                                pricingHtml += `</div>`;
                            }

                            pricingHtml += `</div>`;
                            return pricingHtml;
                        })()}
                        
                        ${p.description ? `<div class="pdp-desc">${p.description.replace(/\n/g, '<br>')}</div>` : ''}
                        
                        <button class="btn-add-cart-large" onclick="Store.addToCart('${p.id}')">
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

        shareProduct: function(productId) {
            const p = this.state.products.find(x => x.id === productId);
            if (!p) return;
            
            const url = window.location.href;
            const shareText = `*${p.name}*\nRR ELECTRRIC — Branded Electrical Products\nSelling Price: ₹${p.selling_price}`;
            
            if (navigator.share) {
                navigator.share({
                    title: `RR ELECTRRIC - ${p.name}`,
                    text: shareText,
                    url: url
                }).catch(err => console.warn('Share failed:', err));
            } else {
                // Fallback for browsers without Web Share API
                navigator.clipboard.writeText(`${shareText}\n\nLink: ${url}`).then(() => CustomUI.alert('Product info and link copied to clipboard!'));
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

        addToCart: function(productId) {
            const p = this.state.products.find(x => x.id === productId);
            if (!p) return;
            
            const existing = this.state.cart.find(x => x.id === productId);
            if (existing) {
                existing.qty += 1;
            } else {
                this.state.cart.push({ id: productId, qty: 1 });
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

        updateCartQty: function(productId, delta) {
            const item = this.state.cart.find(x => x.id === productId);
            if (!item) return;
            
            item.qty += delta;
            if (item.qty <= 0) {
                this.state.cart = this.state.cart.filter(x => x.id !== productId);
            }
            this.saveCart();
        },

        removeFromCart: function(productId) {
            this.state.cart = this.state.cart.filter(x => x.id !== productId);
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
                    const itemMrp = (product.mrp_price && product.mrp_price > product.selling_price) ? product.mrp_price : product.selling_price;
                    mrpSubtotal += itemMrp * item.qty;
                    sellingSubtotal += product.selling_price * item.qty;
                    validItems.push({ ...product, qty: item.qty });
                }
            });

            const productDiscount = mrpSubtotal - sellingSubtotal;

            // 2. VIP Logic (Tier with highest min_spend that we qualify for based on sellingSubtotal)
            let vipDiscount = 0;
            let appliedVipName = null;
            const applicableVip = this.state.vipTiers.find(v => sellingSubtotal >= v.min_spend);
            
            if (applicableVip) {
                vipDiscount = (sellingSubtotal * applicableVip.discount_percentage) / 100;
                appliedVipName = applicableVip.name;
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

            const total = sellingSubtotal - vipDiscount - couponDiscount;

            return {
                validItems,
                subtotal: mrpSubtotal,
                sellingSubtotal,
                productDiscount,
                vipDiscount,
                appliedVipName,
                couponDiscount,
                appliedCouponObj,
                couponMsg,
                total: Math.max(0, total)
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
                const mrpHtml = (item.mrp_price && item.mrp_price > item.selling_price) 
                    ? `<span style="font-size: 13px; color: var(--text-muted); margin-left: 8px; font-weight: normal;">MRP <span style="text-decoration: line-through;">₹${item.mrp_price}</span></span>` 
                    : '';
                return `
                    <div class="cart-item">
                        <img src="${img}" class="cart-item-img" alt="${item.name}">
                        <div class="cart-item-details">
                            <div class="cart-item-title">${item.name}</div>
                            <div class="cart-item-price">₹${item.selling_price} ${mrpHtml}</div>
                            <div class="cart-qty-row">
                                <div class="cart-qty-controls">
                                    <button class="cart-qty-btn" aria-label="Decrease quantity" onclick="Store.updateCartQty('${item.id}', -1)">
                                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                    </button>
                                    <div class="cart-qty-val">${item.qty}</div>
                                    <button class="cart-qty-btn" aria-label="Increase quantity" onclick="Store.updateCartQty('${item.id}', 1)">
                                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                    </button>
                                </div>
                                <button class="cart-remove-btn" aria-label="Remove item" onclick="Store.removeFromCart('${item.id}')">
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
                    <div class="summary-row total">
                        <span>Final Total</span>
                        <span>₹${totals.total.toFixed(2)}</span>
                    </div>
                    <button class="btn-checkout" onclick="Store.navigate('checkout')">Proceed to Checkout</button>
                </div>
            `;

            container.innerHTML = `
                <div class="cart-items-section">
                    ${itemsHtml}
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
                const itemTotal = (item.selling_price * item.qty).toFixed(2);
                const mrpHtml = (item.mrp_price && item.mrp_price > item.selling_price) 
                    ? `<span style="font-size: 11px; color: var(--text-muted); margin-left: 6px; font-weight: normal;">MRP <span style="text-decoration: line-through;">₹${(item.mrp_price * item.qty).toFixed(2)}</span></span>` 
                    : '';
                return `
                <div class="checkout-item-compact">
                    <span class="checkout-item-title">${item.qty} × ${item.name}</span>
                    <span style="font-weight: 600;">₹${itemTotal} ${mrpHtml}</span>
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
                
                const { data, error } = await supabase.functions.invoke('create-order', {
                    body: {
                        customer: customerData,
                        cart: this.state.cart,
                        couponCode: this.state.appliedCouponCode,
                        idempotencyKey: idempotencyKey
                    }
                });

                if (error) throw error;
                if (data.error) throw new Error(data.error);

                // Keep button disabled to prevent resubmission
                btn.textContent = 'Order Confirmed! Opening WhatsApp...';

                // Grab totals one last time for the receipt format
                const totals = this.calculateTotals();

                // Clear Cart
                this.state.cart = [];
                this.state.appliedCouponCode = null;
                this.saveCart();

                // Send to WhatsApp
                this.sendWhatsAppOrder(data.order_reference, customerData, totals);

                // Redirect home in the background
                setTimeout(() => {
                    this.navigate('home');
                }, 1000);

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

        sendWhatsAppOrder: function(orderRef, customer, totals) {
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
            totals.validItems.forEach(item => {
                msg += `${item.qty} × ${item.name}\n`;
                msg += `₹${item.selling_price} each\n\n`;
            });

            msg += `*Subtotal:* ₹${totals.subtotal.toFixed(2)}\n`;
            if (totals.productDiscount > 0) msg += `*Product Discount:* -₹${totals.productDiscount.toFixed(2)}\n`;
            if (totals.vipDiscount > 0) msg += `*VIP (${totals.appliedVipName}):* -₹${totals.vipDiscount.toFixed(2)}\n`;
            if (totals.couponDiscount > 0) msg += `*Coupon:* -₹${totals.couponDiscount.toFixed(2)}\n`;
            msg += `*TOTAL:* ₹${totals.total.toFixed(2)}\n\n`;
            
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