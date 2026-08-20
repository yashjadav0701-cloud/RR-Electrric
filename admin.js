(function() {
    'use strict';

    // --- INVOICE GENERATOR CONFIGURATION ---
    const InvoiceSettings = {
        storeName: "RR ELECTRRIC",
        address: "Shop No 2, Dharmdeep flat, vaishali road, beside sai vatika party plot",
        phone: "7573967357",
        email: "rrelectrric@gmail.com",
        terms: "Thank you for doing business with us.",
        description: "2 years replacement guarantee",
        signatoryName: "Rajan R Vaghela",
        logoUrl: "/assets/logo-full.svg", // Replaced with your full logo
        signatureUrl: "/assets/sign.png" 
    };

    function numberToWords(num) {
        const a = ['','One ','Two ','Three ','Four ', 'Five ','Six ','Seven ','Eight ','Nine ','Ten ','Eleven ','Twelve ','Thirteen ','Fourteen ','Fifteen ','Sixteen ','Seventeen ','Eighteen ','Nineteen '];
        const b = ['', '', 'Twenty','Thirty','Forty','Fifty', 'Sixty','Seventy','Eighty','Ninety'];
        if ((num = num.toString()).length > 9) return 'Overflow';
        let n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
        if (!n) return; let str = '';
        str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Lakh ' : '';
        str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
        str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
        str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
        str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) + 'Rupees Only' : 'Rupees Only';
        return str;
    }

    window.generateInvoice = async function(orderId, btnElement) {
        const order = AdminApp.state.orders.find(o => o.id === orderId);
        if (!order) return CustomUI.alert("Order data not found.");

        const originalBtnText = btnElement.innerHTML;
        btnElement.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"></path></svg> Generating...`;
        btnElement.disabled = true;

        try {
            const c = order.customers;
            const items = order.order_items;
            
            const orderDateObj = new Date(order.created_at);
            const dDate = orderDateObj.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
            const dTime = orderDateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

            const safeCustomerName = c.name.replace(/[^a-zA-Z0-9]/g, '_');
            const pdfFilename = `${safeCustomerName}-${order.order_reference}.pdf`;

            let totalQty = 0;
            let finalTotal = 0;
            let totalMRP = 0;
            let itemsHTML = '';
            let warrantiesList = [];

            items.forEach((item, index) => {
                let itemTotal = item.total_price;
                let unitPrice = itemTotal / item.quantity;
                
                // Fallback to unit price if MRP is not set
                let mrpPrice = (item.products && item.products.mrp_price > unitPrice) ? item.products.mrp_price : unitPrice;
                
                totalQty += item.quantity;
                finalTotal += itemTotal;
                totalMRP += (mrpPrice * item.quantity);

                let displayName = item.product_name_snapshot;
                if (item.is_pack) displayName += ` (Pack of ${item.pack_qty})`;
                if (item.selected_options) displayName += ` - ${item.selected_options}`;

                if (item.products?.warranty) {
                    warrantiesList.push(`
                        <div style="display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px;">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#000" stroke-width="2.5" style="flex-shrink: 0; margin-top: 2px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                            <div style="font-size: 16px; line-height: 1.4; color: #333;">
                                <strong style="color: #000;">${item.products.warranty} Brand Warranty</strong> &mdash; ${item.product_name_snapshot}
                            </div>
                        </div>
                    `);
                }

                // 6 Columns. Flawless single-border system (Right & Bottom only on cells). Scaled for 1080px.
                itemsHTML += `
                    <tr style="background: #fff; color: #000;">
                        <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 14px; text-align: center; box-sizing: border-box;">${index + 1}</td>
                        <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 14px; font-weight: bold; box-sizing: border-box;">${displayName}</td>
                        <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 14px; text-align: center; box-sizing: border-box;">${item.quantity}</td>
                        <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 14px; text-align: center; box-sizing: border-box;">₹ ${mrpPrice.toFixed(2)}</td>
                        <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 14px; text-align: center; box-sizing: border-box;">₹ ${unitPrice.toFixed(2)}</td>
                        <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 14px; text-align: center; box-sizing: border-box;">₹ ${itemTotal.toFixed(2)}</td>
                    </tr>
                `;
            });

            // Dynamically construct Calculation Rows Array to mathematically lock the Rowspan
            let calcRowsArray = [];
            
            let productDiscount = totalMRP - finalTotal;
            if (productDiscount > 0) {
                calcRowsArray.push(`<td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 10px 16px; box-sizing: border-box;" colspan="2">Product Discount</td><td style="border-right: 1px solid #000; border-bottom: 1px solid #000; text-align: center; padding: 10px 16px; box-sizing: border-box; color: #15803d; font-weight: bold;">- ₹ ${productDiscount.toFixed(2)}</td>`);
            }

            if (order.vip_discount > 0) {
                calcRowsArray.push(`<td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 10px 16px; box-sizing: border-box;" colspan="2">VIP Discount</td><td style="border-right: 1px solid #000; border-bottom: 1px solid #000; text-align: center; padding: 10px 16px; box-sizing: border-box; color: #15803d; font-weight: bold;">- ₹ ${order.vip_discount.toFixed(2)}</td>`);
            }
            if (order.coupon_discount > 0) {
                calcRowsArray.push(`<td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 10px 16px; box-sizing: border-box;" colspan="2">Coupon Discount</td><td style="border-right: 1px solid #000; border-bottom: 1px solid #000; text-align: center; padding: 10px 16px; box-sizing: border-box; color: #15803d; font-weight: bold;">- ₹ ${order.coupon_discount.toFixed(2)}</td>`);
            }
            if (order.delivery_charge > 0) {
                calcRowsArray.push(`<td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 10px 16px; box-sizing: border-box;" colspan="2">Delivery Charge</td><td style="border-right: 1px solid #000; border-bottom: 1px solid #000; text-align: center; padding: 10px 16px; box-sizing: border-box;">₹ ${order.delivery_charge.toFixed(2)}</td>`);
            }

            calcRowsArray.push(`<td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 16px 16px; font-weight: bold; font-size: 20px; box-sizing: border-box; background: #f8fafc;" colspan="2">Final Total</td><td style="border-right: 1px solid #000; border-bottom: 1px solid #000; text-align: center; font-weight: bold; font-size: 20px; box-sizing: border-box; background: #f8fafc;">₹ ${order.final_total.toFixed(2)}</td>`);

            const rowCount = calcRowsArray.length;
            let amountInWords = numberToWords(order.final_total);
            
            // Amount in words strictly spans exactly 3 columns (#, Item Name, Qty). 
            let calculationHTML = `
                <tr style="color: #000;">
                    <td colspan="3" rowspan="${rowCount}" style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 20px; vertical-align: top; box-sizing: border-box;">
                        <span style="font-weight: bold; font-size: 15px; text-transform: uppercase; color: #555;">Invoice Amount In Words:</span><br>
                        <span style="font-weight: bold; font-size: 19px; display: inline-block; margin-top: 10px;">${amountInWords}</span>
                    </td>
                    ${calcRowsArray[0]}
                </tr>
            `;

            for (let i = 1; i < rowCount; i++) {
                calculationHTML += `
                <tr style="color: #000;">
                    ${calcRowsArray[i]}
                </tr>`;
            }

            let descriptionParts = [];
            if (warrantiesList.length > 0) {
                descriptionParts.push(`<div style="display: flex; flex-direction: column; gap: 6px;">${warrantiesList.join('')}</div>`);
            }
            if (order.notes) {
                descriptionParts.push(`<strong>Order Note:</strong><br><span style="color: #333;">${order.notes.replace(/\n/g, '<br>')}</span>`);
            }
            let descriptionHTML = descriptionParts.join('<br><br>');

            const invoiceWrapper = document.createElement('div');
            // DEVICE-INDEPENDENT FIX: Use fixed absolute positioning completely decoupled from viewport scaling and scroll.
            invoiceWrapper.style.cssText = 'position: fixed; top: 0; left: 0; width: 1080px; z-index: -9999; opacity: 0.001; pointer-events: none; margin: 0; padding: 0; border: none; overflow: visible;';
            
            // Scaled fonts and paddings to perfectly map to a 1080px document
            invoiceWrapper.innerHTML = `
                <div id="pdf-dynamic-box" style="width: 1080px; padding: 48px; background: #fff; box-sizing: border-box; font-family: Helvetica, Arial, sans-serif; color: #000; margin: 0; position: relative;">
                    <h2 style="text-align: center; font-size: 32px; font-weight: bold; margin: 0 0 28px 0; color: #000;">Tax Invoice</h2>
                    
                    <table style="width: 100%; border-collapse: separate; border-spacing: 0; border-top: 1px solid #000; border-left: 1px solid #000; font-size: 19px; background: #fff; margin: 0; padding: 0;">
                        
                        <!-- HEADER -->
                        <tr style="color: #000;">
                            <td colspan="6" style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 28px; box-sizing: border-box;">
                                <div style="display: flex; align-items: center; gap: 32px;">
                                    <img src="${InvoiceSettings.logoUrl}" style="max-width: 240px; height: 80px; object-fit: contain;">
                                    <div>
                                        <h1 style="margin: 0 0 8px 0; font-size: 30px; font-weight: bold; color: #000;">${InvoiceSettings.storeName}</h1>
                                        <p style="margin: 0 0 6px 0; font-size: 18px; color: #333;">${InvoiceSettings.address}</p>
                                        <p style="margin: 0; font-size: 18px; color: #333;">Phone: <strong style="color: #000;">${InvoiceSettings.phone}</strong> &nbsp;|&nbsp; Email: <strong style="color: #000;">${InvoiceSettings.email}</strong></p>
                                    </div>
                                </div>
                            </td>
                        </tr>

                        <!-- INFO -->
                        <tr style="color: #000;">
                            <td colspan="4" style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 22px; vertical-align: top; width: 60%; box-sizing: border-box;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; font-weight: bold; text-transform: uppercase; color: #555;">Bill To:</p>
                                <p style="margin: 0 0 10px 0; font-size: 22px; font-weight: bold; text-transform: capitalize; color: #000;">${c.name}</p>
                                <p style="margin: 0 0 6px 0; font-size: 18px; color: #000;"><strong>Phone:</strong> ${c.phone}</p>
                                <p style="margin: 0 0 6px 0; font-size: 18px; color: #000;"><strong>Address:</strong> ${c.address}</p>
                                <p style="margin: 0; font-size: 18px; color: #000;"><strong>Area:</strong> ${c.area} - Nadiad ${c.landmark ? `<br><strong>Landmark:</strong> ${c.landmark}` : ''}</p>
                            </td>
                            <td colspan="2" style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 22px; vertical-align: top; width: 40%; box-sizing: border-box;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; font-weight: bold; text-transform: uppercase; color: #555;">Invoice Details:</p>
                                <table style="width: 100%; border: none; font-size: 18px; line-height: 1.8; color: #000; margin: 0; padding: 0;">
                                    <tr><td style="width: 80px; padding: 2px 0; border: none;">No:</td><td style="padding: 2px 0; border: none;"><strong>${order.order_reference}</strong></td></tr>
                                    <tr><td style="padding: 2px 0; border: none;">Date:</td><td style="padding: 2px 0; border: none;"><strong>${dDate}</strong></td></tr>
                                    <tr><td style="padding: 2px 0; border: none;">Time:</td><td style="padding: 2px 0; border: none;"><strong>${dTime}</strong></td></tr>
                                </table>
                            </td>
                        </tr>

                        <!-- TABLE HEADERS -->
                        <tr style="background: #f8fafc; font-weight: bold; color: #000;">
                            <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 14px; text-align: center; width: 5%; box-sizing: border-box;">#</td>
                            <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 14px; text-align: center; width: 41%; box-sizing: border-box;">Item Name</td>
                            <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 14px; text-align: center; width: 8%; box-sizing: border-box;">Qty</td>
                            <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 14px; text-align: center; width: 14%; box-sizing: border-box;">MRP</td>
                            <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 14px; text-align: center; width: 14%; box-sizing: border-box;">RR Price</td>
                            <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 14px; text-align: center; width: 18%; box-sizing: border-box;">Amount</td>
                        </tr>

                        ${itemsHTML}

                        <!-- ITEM TOTALS -->
                        <tr style="background: #f8fafc; font-weight: bold; color: #000;">
                            <td colspan="2" style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 14px; text-align: center; box-sizing: border-box;">Total</td>
                            <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 14px; text-align: center; box-sizing: border-box;">${totalQty}</td>
                            <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 14px; text-align: center; box-sizing: border-box;">₹ ${totalMRP.toFixed(2)}</td>
                            <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 14px; text-align: center; box-sizing: border-box;">₹ ${finalTotal.toFixed(2)}</td>
                            <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 14px; text-align: center; box-sizing: border-box;">₹ ${finalTotal.toFixed(2)}</td>
                        </tr>

                        <!-- CALCULATIONS -->
                        ${calculationHTML}

                        <!-- FOOTER -->
                        <tr style="color: #000;">
                            <td colspan="4" style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 0; vertical-align: top; box-sizing: border-box;">
                                <div style="border-bottom: 1px solid #000; padding: 12px 22px; font-weight: bold; background: #f8fafc; text-transform: uppercase; font-size: 15px; color: #64748b;">Description & Notes:</div>
                                <div style="padding: 22px; line-height: 1.6; font-size: 18px;">${descriptionHTML}</div>
                            </td>
                            <td colspan="2" style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 0; vertical-align: top; box-sizing: border-box;">
                                <div style="border-bottom: 1px solid #000; padding: 12px 22px; font-weight: bold; background: #f8fafc; text-transform: uppercase; font-size: 15px; color: #64748b;">Store Message:</div>
                                <div style="padding: 22px; border-bottom: 1px solid #000; line-height: 1.6; font-size: 18px; margin: 0;">${InvoiceSettings.terms}</div>
                                <div style="padding: 12px 22px; border-bottom: 1px solid #000; font-weight: bold; background: #f8fafc; text-transform: uppercase; font-size: 15px; color: #64748b;">For ${InvoiceSettings.storeName}:</div>
                                <div style="padding: 22px; text-align: center;">
                                    <img src="${InvoiceSettings.signatureUrl}" style="height: 68px; margin-bottom: 6px; object-fit: contain;" onerror="this.style.display='none'"><br>
                                    <span style="font-size: 19px; font-weight: bold;">${InvoiceSettings.signatoryName}</span>
                                </div>
                            </td>
                        </tr>
                    </table>
                </div>
            `;

            document.body.appendChild(invoiceWrapper);

            setTimeout(async () => {
                try {
                    const contentBox = document.getElementById('pdf-dynamic-box');
                    
                    // Allow DOM a brief moment to finish rendering all dynamic elements/SVGs before measuring height
                    await new Promise(resolve => setTimeout(resolve, 150));

                    // Use getBoundingClientRect to capture exact fractional pixels
                    const exactHeight = Math.ceil(contentBox.getBoundingClientRect().height) + 2; 

                    const opt = {
                        margin:       0, // Native margin handled flawlessly by the HTML 48px padding
                        filename:     pdfFilename,
                        image:        { type: 'jpeg', quality: 0.85 }, // Great quality, low MB size
                        html2canvas:  { 
                            scale: 3, 
                            useCORS: true, 
                            windowWidth: 1080, // Force logical window
                            width: 1080, // Force canvas width
                            windowHeight: exactHeight, // Force logical height
                            height: exactHeight, // Force canvas height
                            scrollX: 0,
                            scrollY: 0,
                            x: 0, // Enforce left coordinate explicitly on the fixed container
                            y: 0  // Enforce top coordinate explicitly on the fixed container
                        }, 
                        jsPDF:        { 
                            unit: 'px', 
                            format: [1080, exactHeight], 
                            orientation: 'portrait',
                            hotfixes: ['px_scaling'] // Ensures 1 CSS px = 1 PDF px
                        },
                        pagebreak:    { mode: 'avoid-all' } // Strictly enforce ONE continuous bill-roll
                    };

                    await html2pdf().set(opt).from(contentBox).save();
                } catch (err) {
                    console.error("PDF Generation Error:", err);
                    CustomUI.alert("Failed to generate PDF. Check console for details.");
                } finally {
                    if (document.body.contains(invoiceWrapper)) {
                        document.body.removeChild(invoiceWrapper);
                    }
                    btnElement.innerHTML = originalBtnText;
                    btnElement.disabled = false;
                }
            }, 150);
        } catch (err) {
            console.error("Critical PDF Error:", err);
            CustomUI.alert("Initialization Failed: " + err.message);
            btnElement.innerHTML = originalBtnText;
            btnElement.disabled = false;
        }
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

    const SUPABASE_URL = 'https://ycckkswajajrqobrohcx.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljY2trc3dhamFqcnFvYnJvaGN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNjQ4MTgsImV4cCI6MjEwMTk0MDgxOH0.G7CQyOFTy_LpOP3PK2QprHDx8cXP_ugqH0mTJaM9Oy4';

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const AdminApp = {
        init: async function() {
            CustomUI.init();
            CustomUI.styleSelects(); // Initiates static selects like coupon-type
            const startTime = Date.now();
            this.bindEvents();
            await this.checkSession();

            // Hide preloader after initial load (minimum 3 seconds)
            const elapsed = Date.now() - startTime;
            const remainingTime = Math.max(0, 3000 - elapsed);
            
            setTimeout(() => {
                const preloader = document.getElementById('global-preloader');
                if (preloader) preloader.classList.add('hidden');
            }, remainingTime);
        },
        
        checkSession: async function() {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                await this.verifyAdminRole(session.user.id);
            } else {
                this.showAuth();
            }
            
            supabase.auth.onAuthStateChange(async (event, session) => {
                if (event === 'SIGNED_OUT') {
                    this.showAuth();
                }
            });
        },

        verifyAdminRole: async function(userId) {
            try {
                const { data, error } = await supabase
                    .from('user_roles')
                    .select('role')
                    .eq('user_id', userId)
                    .single();
                    
                if (error || !data || data.role !== 'admin') {
                    throw new Error('Unauthorized: Admin access required.');
                }
                
                this.showApp();
            } catch (err) {
                this.showError('Access denied. You are not an authorized admin.');
                await supabase.auth.signOut();
            }
        },

        showAuth: function() {
            document.getElementById('admin-app').classList.add('hidden');
            document.getElementById('admin-auth').classList.remove('hidden');
        },

        showApp: function() {
            document.getElementById('admin-auth').classList.add('hidden');
            document.getElementById('admin-app').classList.remove('hidden');
            this.loadView('dashboard');
        },
        
        showError: function(message) {
            const errorEl = document.getElementById('login-error');
            if (errorEl) {
                if (message) {
                    errorEl.textContent = message;
                    errorEl.classList.remove('hidden');
                } else {
                    errorEl.classList.add('hidden');
                    errorEl.textContent = '';
                }
            }
        },

        bindEvents: function() {
            const loginForm = document.getElementById('login-form');
            if (loginForm) {
                loginForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const email = document.getElementById('admin-email').value;
                    const password = document.getElementById('admin-password').value;
                    const btn = document.getElementById('login-btn');
                    
                    btn.textContent = 'Authenticating...';
                    btn.disabled = true;
                    this.showError(''); 
                    
                    const { data, error } = await supabase.auth.signInWithPassword({
                        email,
                        password
                    });
                    
                    if (error) {
                        this.showError(error.message);
                        btn.textContent = 'Authenticate';
                        btn.disabled = false;
                    } else {
                        await this.verifyAdminRole(data.user.id);
                        btn.textContent = 'Authenticate';
                        btn.disabled = false;
                    }
                });
            }

            const navLinks = document.querySelectorAll('.admin-nav a');
            navLinks.forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    navLinks.forEach(l => l.classList.remove('active'));
                    e.currentTarget.classList.add('active');
                    const view = e.currentTarget.getAttribute('href').replace('#', '');
                    this.loadView(view);
                });
            });

            document.getElementById('logout-btn')?.addEventListener('click', async () => {
                await supabase.auth.signOut();
            });
        },
        
        loadView: function(viewId) {
            document.getElementById('view-title').textContent = viewId.charAt(0).toUpperCase() + viewId.slice(1);
            document.querySelectorAll('.admin-view').forEach(v => v.classList.add('hidden'));
            
            const viewEl = document.getElementById(`view-${viewId}`);
            if(viewEl) viewEl.classList.remove('hidden');

            if(viewId === 'dashboard') {
                this.initDashboardView();
            } else if (viewId === 'products') {
                this.initProductsView();
            } else if (viewId === 'configurations') {
                this.initConfigurationsView();
            } else if (viewId === 'orders') {
                this.initOrdersView();
            }
        },

        initDashboardView: async function() {
            // Fetch high-level metrics simultaneously
            const [ordersRes, productsRes] = await Promise.all([
                supabase.from('orders').select('final_total, status, order_reference, created_at').order('created_at', { ascending: false }),
                supabase.from('products').select('id', { count: 'exact' }).eq('is_active', true)
            ]);

            if (ordersRes.error) return console.error("Failed to load dashboard orders", ordersRes.error);

            const orders = ordersRes.data || [];
            
            // Crunch the numbers
            const pendingCount = orders.filter(o => o.status === 'pending').length;
            const totalRevenue = orders.filter(o => o.status === 'accepted').reduce((sum, o) => sum + (o.final_total || 0), 0);
            
            // Push to UI
            document.getElementById('dash-pending-orders').textContent = pendingCount;
            document.getElementById('dash-total-revenue').textContent = `₹${totalRevenue.toLocaleString('en-IN')}`;
            document.getElementById('dash-active-products').textContent = productsRes.count || 0;

            // Render Recent Orders List
            const recent = orders.slice(0, 5); // Grab only the latest 5
            const tbody = document.getElementById('dash-recent-orders');
            
            if (recent.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" style="padding: 16px; text-align: center; color: var(--text-muted);">No orders in the system yet.</td></tr>`;
                return;
            }

            tbody.innerHTML = recent.map(o => {
                const date = new Date(o.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                const isPending = o.status === 'pending';
                
                // Compact SVG icons to save horizontal space
                const statusIcon = isPending 
                    ? `<div style="display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: #fee2e2; color: #991b1b;" title="Pending">
                           <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                       </div>`
                    : `<div style="display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: #dcfce7; color: #166534;" title="Completed">
                           <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                       </div>`;

                return `
                    <tr style="border-bottom: 1px solid var(--border);">
                        <td style="padding: 12px 16px; font-weight: 600;">${o.order_reference}</td>
                        <td style="padding: 12px 16px; color: var(--text-muted); white-space: nowrap; text-align: center;">${date}</td>
                        <td style="padding: 12px 16px; font-weight: 600; text-align: center;">₹${o.final_total}</td>
                        <td style="padding: 12px 16px;">
                            <div style="display: flex; justify-content: center;">
                                ${statusIcon}
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        },

        // --- PHASE 14: ORDERS ---
        initOrdersView: async function() {
            this.switchOrderTab('pending');
        },

        switchOrderTab: async function(tab) {
            this.state.currentOrderTab = tab;
            
            document.querySelectorAll('.tab-btn').forEach(btn => {
                const isMatch = btn.textContent.toLowerCase().includes(tab === 'accepted' ? 'archive' : 'pending');
                btn.classList.toggle('active', isMatch);
            });

            await this.loadOrders();
        },

        loadOrders: async function() {
            const container = document.getElementById('orders-container');
            const loader = document.getElementById('orders-loading');
            
            container.innerHTML = '';
            loader.classList.remove('hidden');

            const { data, error } = await supabase
                .from('orders')
                .select(`
                    *,
                    customers (*),
                    order_items (*, products(image_urls, mrp_price, selling_price, warranty)),
                    coupons (code)
                `)
                .eq('status', this.state.currentOrderTab)
                .order('created_at', { ascending: false });

            loader.classList.add('hidden');

            if (error) {
                container.innerHTML = `<p style="color:var(--danger)">Failed to load orders: ${error.message}</p>`;
                return;
            }

            this.state.orders = data || [];
            this.renderOrders();
        },

        renderOrders: function() {
            const container = document.getElementById('orders-container');
            
            if (this.state.orders.length === 0) {
                container.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-muted);">No ${this.state.currentOrderTab} orders found.</div>`;
                return;
            }

            container.innerHTML = this.state.orders.map(order => {
                const c = order.customers;
                const items = order.order_items;
                const d = new Date(order.created_at).toLocaleString();
                
                let mrpSubtotal = 0;
                let sellingSubtotal = 0;

                let itemsHtml = items.map(item => {
                    const p = item.products || {};
                    const img = p.image_urls?.[0] || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" background="%23f1f5f9"></svg>';
                    const itemMrp = (p.mrp_price && p.mrp_price > item.unit_price_snapshot) ? p.mrp_price : item.unit_price_snapshot;
                    
                    mrpSubtotal += itemMrp * item.quantity;
                    sellingSubtotal += item.total_price;

                    let displayName = item.product_name_snapshot;
                    if (item.is_pack) displayName += ` <span style="color:var(--primary); font-weight:800; font-size:11px; background:rgba(34,211,238,0.1); padding:2px 6px; border-radius:4px; margin-left:6px; display:inline-block; vertical-align:middle;">Pack of ${item.pack_qty}</span>`;
                    if (item.selected_options) displayName += ` <div style="font-size:12px; color:var(--text-muted); margin-top:4px; font-weight:600;">${item.selected_options}</div>`;

                    return `
                    <div class="order-item-row" style="display: flex; gap: 10px; align-items: center; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px dashed var(--border);">
                        <img src="${img}" style="width: 48px; height: 48px; object-fit: contain; border-radius: 6px; border: 1px solid var(--border); background: #ffffff; padding: 3px; flex-shrink: 0; box-shadow: var(--shadow-sm);">
                        <span style="flex:1; line-height: 1.3; font-size: 13px;">
                            <span style="font-weight: 700; font-size: 14px;">${item.quantity} ×</span> ${displayName}
                        </span>
                    </div>
                    `;
                }).join('');

                const productDiscount = mrpSubtotal - sellingSubtotal;

                const isPending = order.status === 'pending';
                let actionHtml = '';

                const cleanPhone = c.phone.replace(/[^0-9+]/g, '');
                
                if (isPending) {
                    actionHtml = `
                        <div class="order-card-actions" style="display: flex; gap: 8px; flex-wrap: nowrap; align-items: center; width: 100%;">
                            <a href="tel:${cleanPhone}" title="Call Customer" style="display: flex; flex: 1; align-items: center; justify-content: center; height: 30px; background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; color: #0f172a; transition: all 0.2s;">
                                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                            </a>
                            <button title="WhatsApp Customer" style="display: flex; flex: 1; align-items: center; justify-content: center; height: 30px; background: #dcfce7; border: 1px solid #bbf7d0; border-radius: 6px; color: #166534; cursor: pointer; transition: all 0.2s;" onclick="AdminApp.contactCustomer('${c.phone}', '${order.order_reference}')">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="none"><path d="M11.99 0a11.96 11.96 0 00-10.3 18.06L0 24l6.09-1.6a11.94 11.94 0 105.9-22.4zM12 21.93a9.92 9.92 0 01-5.07-1.38l-.36-.21-3.77.99 1.01-3.68-.24-.37A9.87 9.87 0 1112 21.93zm5.42-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.39-1.4-.88-.74-1.48-1.64-1.65-1.94-.17-.3 0-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.48-.5-.67-.51-.17 0-.37 0-.57 0-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.06 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35z"/></svg>
                            </button>
                            <button title="Reject Order" style="display: flex; flex: 1; align-items: center; justify-content: center; height: 30px; background: #ef4444; border: 1px solid #dc2626; border-radius: 6px; color: #fff; cursor: pointer; transition: all 0.2s;" onclick="AdminApp.rejectOrder('${order.id}')">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                            <button title="Accept Order" style="display: flex; flex: 1; align-items: center; justify-content: center; height: 30px; background: #16a34a; border: 1px solid #15803d; border-radius: 6px; color: #fff; cursor: pointer; transition: all 0.2s;" onclick="AdminApp.acceptOrder('${order.id}')">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            </button>
                        </div>
                    `;
                } else {
                    actionHtml = `
                        <div class="order-card-actions" style="display: flex; gap: 8px; flex-wrap: nowrap; align-items: center; width: 100%;">
                            <a href="tel:${cleanPhone}" title="Call Customer" style="display: flex; flex: 1; align-items: center; justify-content: center; height: 30px; background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; color: #0f172a; transition: all 0.2s;">
                                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                            </a>
                            <button title="WhatsApp Customer" style="display: flex; flex: 1; align-items: center; justify-content: center; height: 30px; background: #dcfce7; border: 1px solid #bbf7d0; border-radius: 6px; color: #166534; cursor: pointer; transition: all 0.2s;" onclick="AdminApp.contactCustomer('${c.phone}', '${order.order_reference}')">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="none"><path d="M11.99 0a11.96 11.96 0 00-10.3 18.06L0 24l6.09-1.6a11.94 11.94 0 105.9-22.4zM12 21.93a9.92 9.92 0 01-5.07-1.38l-.36-.21-3.77.99 1.01-3.68-.24-.37A9.87 9.87 0 1112 21.93zm5.42-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.39-1.4-.88-.74-1.48-1.64-1.65-1.94-.17-.3 0-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.48-.5-.67-.51-.17 0-.37 0-.57 0-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.06 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35z"/></svg>
                            </button>
                            <button title="Download Invoice" style="display: flex; flex: 2; align-items: center; justify-content: center; gap: 4px; height: 30px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; color: #1d4ed8; font-weight: 700; font-size: 12px; cursor: pointer; transition: all 0.2s;" onclick="generateInvoice('${order.id}', this)">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                Invoice
                            </button>
                        </div>
                    `;
                }

                const isArchived = order.status === 'accepted';
                
                return `
                    <div class="admin-order-card" style="border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; background: var(--bg-surface); box-shadow: var(--shadow-sm); padding: 0;">
                        <!-- Accordion Header (Summary) -->
                        <div onclick="AdminApp.toggleOrderDetails('${order.id}')" style="cursor: pointer; display: flex; justify-content: space-between; align-items: center; padding: 16px; background: var(--bg-surface); transition: background 0.2s;" onmouseover="this.style.background='var(--bg-main)'" onmouseout="this.style.background='var(--bg-surface)'">
                            <div style="display: flex; flex-direction: column; gap: 4px;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <strong style="font-size: 15px; color: var(--text-main); letter-spacing: -0.3px;">${order.order_reference}</strong>
                                    ${isPending ? '<span style="width: 8px; height: 8px; background: var(--warning); border-radius: 50%; display: inline-block; box-shadow: 0 0 6px rgba(180,83,9,0.5);"></span>' : ''}
                                </div>
                                <div style="font-size: 13px; color: var(--text-muted); display: flex; align-items: center; gap: 6px;">
                                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                    ${c.name}
                                </div>
                            </div>
                            <div style="text-align: right; display: flex; align-items: center; gap: 16px;">
                                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px;">
                                    <div style="font-size: 16px; font-weight: 800; color: var(--text-main);">₹${order.final_total}</div>
                                    <div style="font-size: 11px; color: var(--text-muted);">${d.split(',')[0]}</div>
                                </div>
                                <div style="width: 28px; height: 28px; border-radius: 50%; background: var(--bg-main); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; color: var(--text-muted);">
                                    <svg id="icon-toggle-${order.id}" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Accordion Body (Full Details - NEW 3 COLUMN GRID) -->
                        <div id="order-details-${order.id}" class="hidden">
                            <div class="admin-order-grid" style="align-items: stretch;">
                                
                                <!-- COLUMN 1: Customer Details -->
                                <div class="admin-order-col customer-col">
                                    <h4 class="col-title">CUSTOMER DETAILS</h4>
                                    <div style="display: flex; flex-direction: column; gap: 10px; font-size: 13px;">
                                        <div style="display: flex; gap: 8px; align-items: flex-start;">
                                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--text-muted)" stroke-width="2" style="margin-top: 2px; flex-shrink: 0;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                            <strong style="color: var(--text-main); font-size: 14px;">${c.name}</strong>
                                        </div>
                                        <div style="display: flex; gap: 8px; align-items: center;">
                                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--text-muted)" stroke-width="2" style="flex-shrink: 0;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                                            <span style="color: var(--primary); font-weight: 500;">${c.phone}</span>
                                        </div>
                                        <div style="display: flex; gap: 8px; align-items: flex-start;">
                                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--text-muted)" stroke-width="2" style="margin-top: 2px; flex-shrink: 0;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                                            <div style="line-height: 1.4; color: var(--text-muted);">
                                                ${c.address}<br>
                                                <span style="font-weight: 500; color: var(--text-main);">${c.area} - Nadiad</span>
                                                ${c.landmark ? `<br>Landmark: ${c.landmark}` : ''}
                                            </div>
                                        </div>
                                    </div>
                                    ${order.notes ? `
                                        <div style="margin-top:16px; padding:10px; background:#fefce8; border:1px solid #fef08a; border-radius:4px; font-size:12px; color: #854d0e;">
                                            <strong style="display:block; margin-bottom:4px;">Order Notes:</strong>${order.notes.replace(/\n/g, '<br>')}
                                        </div>
                                    ` : ''}
                                    
                                    <h4 class="col-title" style="margin-top: 24px;">BILL SUMMARY</h4>
                                    <div class="order-totals" style="font-size: 13px;">
                                        <div style="display: flex; justify-content: space-between; margin-bottom: 6px; color: var(--text-muted);">
                                            <span>Subtotal (MRP)</span>
                                            <span>₹${mrpSubtotal.toFixed(2)}</span>
                                        </div>
                                        ${productDiscount > 0 ? `
                                            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; color: var(--success);">
                                                <span>Product Discount</span>
                                                <span>-₹${productDiscount.toFixed(2)}</span>
                                            </div>
                                        ` : ''}
                                        <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-weight: 600; color: var(--text-main);">
                                            <span>RR Price</span>
                                            <span>₹${sellingSubtotal.toFixed(2)}</span>
                                        </div>
                                        ${order.vip_discount > 0 ? `
                                            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; color: var(--text-main);">
                                                <span>VIP Discount</span>
                                                <span>-₹${order.vip_discount}</span>
                                            </div>
                                        ` : ''}
                                        ${order.coupon_discount > 0 ? `
                                            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; color: var(--text-main);">
                                                <span>Coupon ${order.coupons?.code ? `(${order.coupons.code})` : ''}</span>
                                                <span>-₹${order.coupon_discount}</span>
                                            </div>
                                        ` : ''}
                                        <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                                            <span style="color: var(--text-muted);">Delivery</span>
                                            <span style="${order.delivery_charge === 0 ? 'color: var(--success); font-weight: 600;' : 'color: var(--text-main);'}">${order.delivery_charge === 0 ? 'FREE' : '₹' + order.delivery_charge}</span>
                                        </div>
                                        <div style="display: flex; justify-content: space-between; font-size: 16px; font-weight: 800; color: var(--text-main); padding-top: 12px; border-top: 1px solid var(--border);">
                                            <span>Final Total</span>
                                            <span>₹${order.final_total}</span>
                                        </div>
                                    </div>
                                </div>

                                <!-- COLUMN 2: Order Items -->
                                <div class="admin-order-col details-col">
                                    <h4 class="col-title">ORDER ITEMS</h4>
                                    <div style="flex: 1; min-height: 0; max-height: 420px; overflow-y: auto; overflow-x: hidden; padding-right: 6px; scrollbar-width: thin;">${itemsHtml}</div>
                                </div>

                                <!-- COLUMN 3: Actions -->
                                <div class="admin-order-col actions-col">
                                    <h4 class="col-title">ACTIONS</h4>
                                    <div class="action-buttons-stack" style="flex-direction: row !important; gap: 8px;">
                                        <a href="tel:${cleanPhone}" class="btn-admin-action btn-call" title="Call Customer" style="padding: 0 !important; height: 32px !important; flex: 1;">
                                            <svg viewBox="0 0 24 24" style="width: 15px !important; height: 15px !important; margin: 0 !important;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                                        </a>
                                        <button class="btn-admin-action btn-wa" title="WhatsApp Customer" style="padding: 0 !important; height: 32px !important; flex: 1;" onclick="AdminApp.contactCustomer('${c.phone}', '${order.order_reference}')">
                                            <svg viewBox="0 0 24 24" style="width: 16px !important; height: 16px !important; fill: currentColor; stroke: none; margin: 0 !important;"><path d="M11.99 0a11.96 11.96 0 00-10.3 18.06L0 24l6.09-1.6a11.94 11.94 0 105.9-22.4zM12 21.93a9.92 9.92 0 01-5.07-1.38l-.36-.21-3.77.99 1.01-3.68-.24-.37A9.87 9.87 0 1112 21.93zm5.42-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.39-1.4-.88-.74-1.48-1.64-1.65-1.94-.17-.3 0-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.48-.5-.67-.51-.17 0-.37 0-.57 0-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.06 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35z"/></svg>
                                        </button>
                                        
                                        ${isPending ? `
                                        <button class="btn-admin-action btn-reject" title="Reject Order" style="padding: 0 !important; height: 32px !important; flex: 1;" onclick="AdminApp.rejectOrder('${order.id}')">
                                            <svg viewBox="0 0 24 24" style="width: 16px !important; height: 16px !important; margin: 0 !important;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                        </button>
                                        <button class="btn-admin-action btn-accept" title="Accept Order" style="padding: 0 !important; height: 32px !important; flex: 1;" onclick="AdminApp.acceptOrder('${order.id}')">
                                            <svg viewBox="0 0 24 24" style="width: 16px !important; height: 16px !important; margin: 0 !important;" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        </button>
                                        ` : `
                                        <button class="btn-admin-action btn-invoice" title="Download Invoice" style="padding: 0 12px !important; height: 32px !important; flex: 2; justify-content: center; gap: 6px;" onclick="generateInvoice('${order.id}', this)">
                                            <svg viewBox="0 0 24 24" style="width: 14px !important; height: 14px !important; margin: 0 !important;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                            <span style="font-size: 11px; display: inline-block !important;">Invoice</span>
                                        </button>
                                        `}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        },

        toggleOrderDetails: function(orderId) {
            const details = document.getElementById(`order-details-${orderId}`);
            const icon = document.getElementById(`icon-toggle-${orderId}`);
            if (details.classList.contains('hidden')) {
                details.classList.remove('hidden');
                icon.style.transform = 'rotate(180deg)';
            } else {
                details.classList.add('hidden');
                icon.style.transform = 'rotate(0deg)';
            }
        },

        acceptOrder: async function(id) {
            if(!await CustomUI.confirm("Accept this order? It will be moved to the archive.", "Accept Order")) return;
            const { error } = await supabase.from('orders').update({ status: 'accepted' }).eq('id', id);
            if(error) CustomUI.alert("Failed to accept: " + error.message, "Error");
            else this.loadOrders();
        },

        rejectOrder: async function(id) {
            if(!await CustomUI.confirm("Are you sure you want to REJECT and permanently delete this order?", "Reject Order")) return;
            const { error } = await supabase.from('orders').delete().eq('id', id);
            if(error) CustomUI.alert("Failed to delete: " + error.message, "Error");
            else this.loadOrders();
        },

        contactCustomer: function(phone, orderRef) {
            const cleanPhone = phone.replace(/[^0-9]/g, '');
            // Append 91 specifically since we enforce 10 digits on checkout
            const msg = encodeURIComponent(`Hi, this is RR ELECTRRIC regarding your order ${orderRef}.`);
            window.open(`https://wa.me/91${cleanPhone}?text=${msg}`, '_blank');
        },

        // --- PHASE 6 & 7: CONFIGURATIONS, VIP, AND COUPONS ---
        state: {
            // ... existing state items ...
            categories: [], products: [], pendingImages: [], existingImages: [],
            vipTiers: [], coupons: [],
            orders: [], currentOrderTab: 'pending'
        },

        initConfigurationsView: async function() {
            if (!this._configEventsBound) {
                this._configEventsBound = true;
                
                // Configs
                document.getElementById('config-form').addEventListener('submit', (e) => this.saveConfigurations(e));
                
                // VIP
                document.getElementById('btn-add-vip').addEventListener('click', () => this.openVipModal());
                document.getElementById('btn-close-vip-modal').addEventListener('click', () => document.getElementById('vip-modal').classList.add('hidden'));
                document.getElementById('vip-form').addEventListener('submit', (e) => this.saveVip(e));
                document.getElementById('btn-delete-vip').addEventListener('click', () => this.deleteVip());
                
                // Coupons
                document.getElementById('btn-add-coupon').addEventListener('click', () => this.openCouponModal());
                document.getElementById('btn-close-coupon-modal').addEventListener('click', () => document.getElementById('coupon-modal').classList.add('hidden'));
                document.getElementById('coupon-form').addEventListener('submit', (e) => this.saveCoupon(e));
                document.getElementById('btn-delete-coupon').addEventListener('click', () => this.deleteCoupon());
            }

            await this.loadConfigurations();
            await this.loadVipTiers();
            await this.loadCoupons();
        },

        loadConfigurations: async function() {
            const { data, error } = await supabase.from('store_configurations').select('*');
            if (error || !data) {
                console.error("Failed to load configs", error);
                return;
            }

            const storeInfo = data.find(c => c.config_key === 'store_info')?.config_value || {};
            const deliverySettings = data.find(c => c.config_key === 'delivery_settings')?.config_value || {};
            const homeSettings = data.find(c => c.config_key === 'homepage_settings')?.config_value || {};

            document.getElementById('config-store-name').value = storeInfo.name || '';
            document.getElementById('config-store-whatsapp').value = storeInfo.whatsapp || '';
            document.getElementById('config-shop-address').value = storeInfo.address || '';
            document.getElementById('config-maps-url').value = storeInfo.maps_url || '';
            
            document.getElementById('config-delivery-area').value = deliverySettings.area || 'Nadiad';
            document.getElementById('config-delivery-min').value = deliverySettings.min_time || '10 minutes';
            document.getElementById('config-delivery-max').value = deliverySettings.max_time || '2 days';
            document.getElementById('config-delivery-charge').value = deliverySettings.charge !== undefined ? deliverySettings.charge : 40;
            document.getElementById('config-delivery-free').value = deliverySettings.free_above !== undefined ? deliverySettings.free_above : 499;
            document.getElementById('config-delivery-min-order').value = deliverySettings.min_order !== undefined ? deliverySettings.min_order : 149;
            
            document.getElementById('config-home-categories').value = (homeSettings.featured_categories || []).join(', ');
        },

        loadVipTiers: async function() {
            const { data, error } = await supabase.from('vip_tiers').select('*').order('min_spend', { ascending: true });
            const container = document.getElementById('vip-list-container');
            if (!container) return; 
            
            if (error) {
                container.innerHTML = `<div style="color:var(--danger); padding: 16px;">Error loading VIP tiers</div>`;
                return;
            }
            this.state.vipTiers = data || [];
            
            if (this.state.vipTiers.length === 0) {
                container.innerHTML = `<div style="text-align:center; padding: 20px; color:var(--text-muted)">No VIP tiers configured.</div>`;
                return;
            }
            
            container.innerHTML = `
                <div class="table-responsive desktop-only">
                    <table class="data-table">
                        <thead><tr><th>Tier Name</th><th>Min Spend (₹)</th><th>Discount (%)</th><th>Status</th><th>Actions</th></tr></thead>
                        <tbody>
                            ${this.state.vipTiers.map(v => `
                                <tr>
                                    <td><strong>${v.name}</strong></td>
                                    <td>₹${v.min_spend}</td>
                                    <td>${v.discount_percentage}%</td>
                                    <td><span class="status-badge ${v.is_active ? 'status-active' : 'status-inactive'}">${v.is_active ? 'Active' : 'Inactive'}</span></td>
                                    <td><div class="action-links"><button onclick="AdminApp.openVipModal('${v.id}')">Edit</button></div></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                
                <div class="mobile-only">
                    <div style="display: flex; flex-direction: column; gap: 16px;">
                        ${this.state.vipTiers.map(v => `
                            <div style="border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-surface); overflow: hidden; box-shadow: var(--shadow-sm);">
                                <div style="padding: 12px 16px; border-bottom: 1px solid var(--border); background: var(--bg-main); display: flex; align-items: center; gap: 8px;">
                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--primary)" stroke-width="2" style="flex-shrink: 0;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                                    <div style="font-size: 15px; font-weight: 700; color: var(--text-main); word-wrap: break-word;">${v.name}</div>
                                </div>
                                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; text-align: center;">
                                    <div style="padding: 10px 4px; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); color: var(--text-muted); font-size: 12px; font-weight: 600; text-transform: uppercase;">Min Spend</div>
                                    <div style="padding: 10px 4px; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); color: var(--text-muted); font-size: 12px; font-weight: 600; text-transform: uppercase;">Discount</div>
                                    <div style="padding: 10px 4px; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); color: var(--text-muted); font-size: 12px; font-weight: 600; text-transform: uppercase;">Status</div>
                                    <div style="padding: 10px 4px; border-bottom: 1px solid var(--border); color: var(--text-muted); font-size: 12px; font-weight: 600; text-transform: uppercase;">Action</div>
                                    
                                    <div style="padding: 12px 2px; border-right: 1px solid var(--border); font-size: 14px; font-weight: 700; display: flex; align-items: center; justify-content: center; color: var(--text-main);">₹${v.min_spend}</div>
                                    <div style="padding: 12px 2px; border-right: 1px solid var(--border); font-size: 14px; font-weight: 700; display: flex; align-items: center; justify-content: center; color: var(--primary);">${v.discount_percentage}%</div>
                                    <div style="padding: 12px 2px; border-right: 1px solid var(--border); display: flex; align-items: center; justify-content: center;">
                                        <span style="font-size: 10px; font-weight: 800; padding: 4px 6px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0; background: ${v.is_active ? '#dcfce7' : '#f1f5f9'}; color: ${v.is_active ? '#15803d' : 'var(--text-muted)'}; border: 1px solid ${v.is_active ? '#bbf7d0' : 'var(--border)'};">
                                            ${v.is_active ? 'ON' : 'OFF'}
                                        </span>
                                    </div>
                                    <div style="padding: 12px 2px; display: flex; align-items: center; justify-content: center;">
                                        <button onclick="AdminApp.openVipModal('${v.id}')" style="background: var(--bg-main); border: 1px solid var(--border); border-radius: 6px; color: var(--text-muted); cursor: pointer; padding: 8px; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" aria-label="Edit Tier">
                                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        },

        openVipModal: function(id = null) {
            document.getElementById('vip-modal').classList.remove('hidden');
            document.getElementById('vip-form-error').classList.add('hidden');
            document.getElementById('vip-form').reset();
            
            const title = document.getElementById('vip-modal-title');
            const delBtn = document.getElementById('btn-delete-vip');
            
            if (id) {
                const v = this.state.vipTiers.find(x => x.id === id);
                if (!v) return;
                title.textContent = 'Edit VIP Tier';
                delBtn.classList.remove('hidden');
                document.getElementById('vip-id').value = v.id;
                document.getElementById('vip-name').value = v.name;
                document.getElementById('vip-min-spend').value = v.min_spend;
                document.getElementById('vip-discount').value = v.discount_percentage;
                document.getElementById('vip-active').checked = v.is_active;
            } else {
                title.textContent = 'Add VIP Tier';
                delBtn.classList.add('hidden');
                document.getElementById('vip-id').value = '';
            }
        },

        saveVip: async function(e) {
            e.preventDefault();
            const btn = document.getElementById('btn-save-vip');
            const errEl = document.getElementById('vip-form-error');
            btn.disabled = true; errEl.classList.add('hidden');
            
            const payload = {
                name: document.getElementById('vip-name').value.trim(),
                min_spend: parseFloat(document.getElementById('vip-min-spend').value),
                discount_percentage: parseFloat(document.getElementById('vip-discount').value),
                is_active: document.getElementById('vip-active').checked
            };
            
            const id = document.getElementById('vip-id').value;
            let res;
            if (id) res = await supabase.from('vip_tiers').update(payload).eq('id', id);
            else res = await supabase.from('vip_tiers').insert(payload);
            
            if (res.error) {
                errEl.textContent = res.error.message;
                errEl.classList.remove('hidden');
                btn.disabled = false;
            } else {
                document.getElementById('vip-modal').classList.add('hidden');
                btn.disabled = false;
                await this.loadVipTiers();
            }
        },
        
        deleteVip: async function() {
            if(!await CustomUI.confirm('Delete this VIP Tier?', 'Delete VIP Tier')) return;
            const id = document.getElementById('vip-id').value;
            await supabase.from('vip_tiers').delete().eq('id', id);
            document.getElementById('vip-modal').classList.add('hidden');
            await this.loadVipTiers();
        },

        loadCoupons: async function() {
            const { data, error } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
            const container = document.getElementById('coupon-list-container');
            if (!container) return;
            
            if (error) {
                container.innerHTML = `<div style="color:var(--danger); padding: 16px;">Error loading coupons</div>`;
                return;
            }
            this.state.coupons = data || [];
            
            if (this.state.coupons.length === 0) {
                container.innerHTML = `<div style="text-align:center; padding: 20px; color:var(--text-muted)">No Coupons configured.</div>`;
                return;
            }
            
            container.innerHTML = `
                <div class="table-responsive desktop-only">
                    <table class="data-table">
                        <thead><tr><th>Code</th><th>Discount</th><th>Min Cart (₹)</th><th>Usage Limit</th><th>Expiry</th><th>Status</th><th>Actions</th></tr></thead>
                        <tbody>
                            ${this.state.coupons.map(c => {
                                const expiryText = c.expires_at ? new Date(c.expires_at).toLocaleDateString() : 'Never';
                                const usageText = c.usage_limit ? `${c.used_count || 0} / ${c.usage_limit}` : 'Unlimited';
                                const discountText = c.discount_type === 'PERCENTAGE' ? `${c.discount_amount}%` : `₹${c.discount_amount}`;
                                return `
                                <tr>
                                    <td><strong>${c.code}</strong></td>
                                    <td>${discountText}</td>
                                    <td>${c.min_cart_value > 0 ? `₹${c.min_cart_value}` : 'None'}</td>
                                    <td>${usageText}</td>
                                    <td>${expiryText}</td>
                                    <td><span class="status-badge ${c.is_active ? 'status-active' : 'status-inactive'}">${c.is_active ? 'Active' : 'Inactive'}</span></td>
                                    <td><div class="action-links"><button onclick="AdminApp.openCouponModal('${c.id}')">Edit</button></div></td>
                                </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
                
                <div class="mobile-only">
                    <div style="display: flex; flex-direction: column; gap: 16px;">
                        ${this.state.coupons.map(c => {
                            const expiryText = c.expires_at ? new Date(c.expires_at).toLocaleDateString() : 'Never';
                            const usageText = c.usage_limit ? `${c.used_count || 0} / ${c.usage_limit}` : '∞';
                            const discountText = c.discount_type === 'PERCENTAGE' ? `${c.discount_amount}%` : `₹${c.discount_amount}`;
                            return `
                            <div style="border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-surface); overflow: hidden; box-shadow: var(--shadow-sm);">
                                <div style="padding: 12px 16px; border-bottom: 1px solid var(--border); background: var(--bg-main); display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--primary)" stroke-width="2" style="flex-shrink: 0;"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
                                        <div style="font-size: 15px; font-weight: 700; color: var(--text-main); word-wrap: break-word;">${c.code}</div>
                                    </div>
                                    <div style="font-size: 15px; font-weight: 800; color: var(--success);">${discountText}</div>
                                </div>
                                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; text-align: center;">
                                    <div style="padding: 10px 4px; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); color: var(--text-muted); font-size: 12px; font-weight: 600; text-transform: uppercase;">Min Cart</div>
                                    <div style="padding: 10px 4px; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); color: var(--text-muted); font-size: 12px; font-weight: 600; text-transform: uppercase;">Used</div>
                                    <div style="padding: 10px 4px; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); color: var(--text-muted); font-size: 12px; font-weight: 600; text-transform: uppercase;">Status</div>
                                    <div style="padding: 10px 4px; border-bottom: 1px solid var(--border); color: var(--text-muted); font-size: 12px; font-weight: 600; text-transform: uppercase;">Action</div>
                                    
                                    <div style="padding: 12px 2px; border-right: 1px solid var(--border); font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; color: var(--text-main);">${c.min_cart_value > 0 ? `₹${c.min_cart_value}` : 'None'}</div>
                                    <div style="padding: 12px 2px; border-right: 1px solid var(--border); font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; color: var(--text-main);">${usageText}</div>
                                    <div style="padding: 12px 2px; border-right: 1px solid var(--border); display: flex; align-items: center; justify-content: center;">
                                        <span style="font-size: 10px; font-weight: 800; padding: 4px 6px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0; background: ${c.is_active ? '#dcfce7' : '#f1f5f9'}; color: ${c.is_active ? '#15803d' : 'var(--text-muted)'}; border: 1px solid ${c.is_active ? '#bbf7d0' : 'var(--border)'};">
                                            ${c.is_active ? 'ON' : 'OFF'}
                                        </span>
                                    </div>
                                    <div style="padding: 12px 2px; display: flex; align-items: center; justify-content: center;">
                                        <button onclick="AdminApp.openCouponModal('${c.id}')" style="background: var(--bg-main); border: 1px solid var(--border); border-radius: 6px; color: var(--text-muted); cursor: pointer; padding: 8px; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" aria-label="Edit Coupon">
                                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                        </button>
                                    </div>
                                </div>
                                <div style="padding: 8px 12px; border-top: 1px solid var(--border); background: var(--bg-surface); font-size: 12px; color: var(--text-muted); text-align: center;">
                                    Expires: <span style="font-weight: 600; color: var(--text-main);">${expiryText}</span>
                                </div>
                            </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        },

        openCouponModal: function(id = null) {
            document.getElementById('coupon-modal').classList.remove('hidden');
            document.getElementById('coupon-form-error').classList.add('hidden');
            document.getElementById('coupon-form').reset();
            
            const title = document.getElementById('coupon-modal-title');
            const delBtn = document.getElementById('btn-delete-coupon');
            
            if (id) {
                const c = this.state.coupons.find(x => x.id === id);
                if (!c) return;
                title.textContent = 'Edit Coupon';
                delBtn.classList.remove('hidden');
                document.getElementById('coupon-id').value = c.id;
                document.getElementById('coupon-code').value = c.code;
                document.getElementById('coupon-type').value = c.discount_type;
                document.getElementById('coupon-amount').value = c.discount_amount;
                document.getElementById('coupon-min-cart').value = c.min_cart_value || '';
                document.getElementById('coupon-max-discount').value = c.max_discount || '';
                document.getElementById('coupon-usage-limit').value = c.usage_limit || '';
                
                if (c.expires_at) {
                    // Format for datetime-local: YYYY-MM-DDThh:mm
                    const d = new Date(c.expires_at);
                    document.getElementById('coupon-expiry').value = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
                } else {
                    document.getElementById('coupon-expiry').value = '';
                }
                
                document.getElementById('coupon-active').checked = c.is_active;
            } else {
                title.textContent = 'Add Coupon';
                delBtn.classList.add('hidden');
                document.getElementById('coupon-id').value = '';
            }
        },

        saveCoupon: async function(e) {
            e.preventDefault();
            const btn = document.getElementById('btn-save-coupon');
            const errEl = document.getElementById('coupon-form-error');
            btn.disabled = true; errEl.classList.add('hidden');
            
            const expiryVal = document.getElementById('coupon-expiry').value;
            
            const payload = {
                code: document.getElementById('coupon-code').value.trim().toUpperCase(),
                discount_type: document.getElementById('coupon-type').value,
                discount_amount: parseFloat(document.getElementById('coupon-amount').value),
                min_cart_value: document.getElementById('coupon-min-cart').value ? parseFloat(document.getElementById('coupon-min-cart').value) : 0,
                max_discount: document.getElementById('coupon-max-discount').value ? parseFloat(document.getElementById('coupon-max-discount').value) : null,
                usage_limit: document.getElementById('coupon-usage-limit').value ? parseInt(document.getElementById('coupon-usage-limit').value) : null,
                expires_at: expiryVal ? new Date(expiryVal).toISOString() : null,
                is_active: document.getElementById('coupon-active').checked
            };
            
            const id = document.getElementById('coupon-id').value;
            let res;
            if (id) res = await supabase.from('coupons').update(payload).eq('id', id);
            else res = await supabase.from('coupons').insert(payload);
            
            if (res.error) {
                errEl.textContent = res.error.message;
                errEl.classList.remove('hidden');
                btn.disabled = false;
            } else {
                document.getElementById('coupon-modal').classList.add('hidden');
                btn.disabled = false;
                await this.loadCoupons();
            }
        },
        
        deleteCoupon: async function() {
            if(!await CustomUI.confirm('Delete this Coupon?', 'Delete Coupon')) return;
            const id = document.getElementById('coupon-id').value;
            await supabase.from('coupons').delete().eq('id', id);
            document.getElementById('coupon-modal').classList.add('hidden');
            await this.loadCoupons();
        },

        saveConfigurations: async function(e) {
            e.preventDefault();
            const btn = document.getElementById('btn-save-config');
            const msgEl = document.getElementById('config-form-msg');
            
            btn.disabled = true;
            btn.textContent = 'Saving...';
            msgEl.classList.add('hidden');

            const mapsUrlInput = document.getElementById('config-maps-url').value.trim();
            
            // Validate Google Maps URL securely before attempting any DB save
            if (mapsUrlInput) {
                try {
                    const parsedUrl = new URL(mapsUrlInput);
                    if (!parsedUrl.hostname.includes('google') && !parsedUrl.hostname.includes('maps.app.goo.gl')) {
                        throw new Error('Invalid Domain');
                    }
                } catch (e) {
                    msgEl.textContent = 'Please enter a valid Google Maps URL (e.g. https://maps.google.com/...)';
                    msgEl.style.color = 'var(--danger)';
                    msgEl.classList.remove('hidden');
                    btn.disabled = false;
                    btn.textContent = 'Save All Configurations';
                    return;
                }
            }

            const storeInfo = {
                name: document.getElementById('config-store-name').value.trim(),
                whatsapp: document.getElementById('config-store-whatsapp').value.trim(),
                address: document.getElementById('config-shop-address').value.trim(),
                maps_url: mapsUrlInput
            };
            
            const deliverySettings = {
                area: document.getElementById('config-delivery-area').value.trim(),
                min_time: document.getElementById('config-delivery-min').value.trim(),
                max_time: document.getElementById('config-delivery-max').value.trim()
            };
            
            const homeSettings = {
                featured_categories: document.getElementById('config-home-categories').value
                    .split(',')
                    .map(s => s.trim())
                    .filter(s => s) // Remove empty strings
            };

            try {
                const updates = [
                    supabase.from('store_configurations').update({ config_value: storeInfo }).eq('config_key', 'store_info'),
                    supabase.from('store_configurations').update({ config_value: deliverySettings }).eq('config_key', 'delivery_settings'),
                    supabase.from('store_configurations').update({ config_value: homeSettings }).eq('config_key', 'homepage_settings')
                ];

                const results = await Promise.all(updates);
                const hasError = results.some(r => r.error);
                if (hasError) throw new Error("One or more configurations failed to save.");
                
                msgEl.textContent = 'Configurations saved successfully!';
                msgEl.style.color = 'var(--success)';
                msgEl.classList.remove('hidden');
            } catch (err) {
                msgEl.textContent = err.message || 'Failed to save configurations.';
                msgEl.style.color = 'var(--danger)';
                msgEl.classList.remove('hidden');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Save All Configurations';
                // Hide success message after 3 seconds
                setTimeout(() => { if(msgEl.style.color === 'var(--success)') msgEl.classList.add('hidden'); }, 3000);
            }
        },

        // --- PHASE 5: PRODUCT MANAGEMENT ---
        state: {
            categories: [],
            products: [],
            pendingImages: [], // New images to upload (Files)
            existingImages: [], // Existing image URLs
            inventoryState: {
                search: '',
                category: 'all',
                status: 'all',
                sort: 'newest'
            }
        },
        
        searchDebounceTimer: null,
        
        handleInventorySearch: function(val) {
            clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = setTimeout(() => {
                this.state.inventoryState.search = val;
                this.renderProducts();
            }, 250);
        },

        normalizeSearchText: function(text) {
            if (!text) return '';
            return text.toLowerCase()
                .replace(/[^a-z0-9\s]/g, ' ')
                .replace(/\b(watts|watt)\b/g, 'w')
                .replace(/\b(kilowatts|kilowatt|kwatt)\b/g, 'kw')
                .replace(/\b(volts|volt)\b/g, 'v')
                .replace(/\b(amps|ampere|amp)\b/g, 'a')
                .replace(/\b(hertz)\b/g, 'hz')
                .replace(/(\d+)\s+(w|kw|v|a|hz)\b/g, '$1$2')
                .replace(/\s+/g, ' ')
                .trim();
        },

        updateSmartLinkSuggestions: function() {
            const nameInput = document.getElementById('product-name').value;
            const container = document.getElementById('product-linked-ids-container');
            if (!container) return;

            const currentProductId = document.getElementById('product-id').value;
            const q = this.normalizeSearchText(nameInput);
            const queryTokens = q.split(' ').filter(t => t);

            let scoredProducts = this.state.products.filter(p => p.id !== currentProductId).map(p => {
                let score = 0;
                
                // Pin already selected items to the very top permanently
                if (AdminApp._currentLinkedIds && AdminApp._currentLinkedIds.has(p.id)) {
                    score += 10000;
                }

                // Score remaining products based on matching name tokens
                if (queryTokens.length > 0) {
                    if (!p._searchNormName) {
                        p._searchNormName = this.normalizeSearchText(p.name);
                        p._searchCat = (p.categories?.name || '').toLowerCase();
                    }

                    queryTokens.forEach(token => {
                        if (p._searchNormName.split(' ').includes(token)) score += 10; // Exact word match
                        else if (p._searchNormName.includes(token)) score += 3; // Partial match
                        else if (p._searchCat.includes(token)) score += 1; // Category match
                    });
                }

                return { product: p, score: score };
            });

            // Sort by highest score first, then alphabetical
            scoredProducts.sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return a.product.name.localeCompare(b.product.name);
            });

            // Rebuild HTML cleanly with checkboxes and images
            container.innerHTML = scoredProducts.map(m => {
                const isChecked = (AdminApp._currentLinkedIds && AdminApp._currentLinkedIds.has(m.product.id)) ? 'checked' : '';
                const img = m.product.image_urls?.[0] || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" background="%23f1f5f9"></svg>';
                return `
                    <label class="linked-product-row">
                        <img src="${img}" alt="">
                        <span>${m.product.name}</span>
                        <input type="checkbox" value="${m.product.id}" ${isChecked} onchange="AdminApp.toggleLinkedProduct('${m.product.id}', this.checked)">
                    </label>
                `;
            }).join('');
        },

        toggleLinkedProduct: function(id, isChecked) {
            if (!AdminApp._currentLinkedIds) AdminApp._currentLinkedIds = new Set();
            if (isChecked) {
                AdminApp._currentLinkedIds.add(id);
            } else {
                AdminApp._currentLinkedIds.delete(id);
            }
        },

        updateAccessorySuggestions: function() {
            const searchInput = document.getElementById('accessory-search-input').value;
            const container = document.getElementById('product-accessory-ids-container');
            if (!container) return;

            const currentProductId = document.getElementById('product-id').value;
            const q = this.normalizeSearchText(searchInput);
            const queryTokens = q.split(' ').filter(t => t);

            let scoredProducts = this.state.products.filter(p => p.id !== currentProductId).map(p => {
                let score = 0;
                
                // Pin already selected items to the very top permanently
                if (AdminApp._currentAccessoryIds && AdminApp._currentAccessoryIds.has(p.id)) {
                    score += 10000;
                }

                // Score remaining products based on matching name tokens from the accessory search box
                if (queryTokens.length > 0) {
                    if (!p._searchNormName) {
                        p._searchNormName = this.normalizeSearchText(p.name);
                        p._searchCat = (p.categories?.name || '').toLowerCase();
                    }

                    queryTokens.forEach(token => {
                        if (p._searchNormName.split(' ').includes(token)) score += 10;
                        else if (p._searchNormName.includes(token)) score += 3;
                        else if (p._searchCat.includes(token)) score += 1;
                    });
                } else if (!AdminApp._currentAccessoryIds || !AdminApp._currentAccessoryIds.has(p.id)) {
                    // Push down non-selected items if there is no search active
                    score -= 1;
                }

                return { product: p, score: score };
            });

            // Sort by highest score first, then alphabetical
            scoredProducts.sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return a.product.name.localeCompare(b.product.name);
            });

            // Limit to top 50 to render fast unless there's a specific search
            if (queryTokens.length === 0) {
                const checkedCount = AdminApp._currentAccessoryIds ? AdminApp._currentAccessoryIds.size : 0;
                const limit = Math.max(50, checkedCount + 10);
                scoredProducts = scoredProducts.slice(0, limit);
            }

            // Rebuild HTML cleanly with checkboxes and images
            container.innerHTML = scoredProducts.map(m => {
                const isChecked = (AdminApp._currentAccessoryIds && AdminApp._currentAccessoryIds.has(m.product.id)) ? 'checked' : '';
                const img = m.product.image_urls?.[0] || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" background="%23f1f5f9"></svg>';
                return `
                    <label class="linked-product-row">
                        <img src="${img}" alt="">
                        <span>${m.product.name}</span>
                        <input type="checkbox" value="${m.product.id}" ${isChecked} onchange="AdminApp.toggleAccessory('${m.product.id}', this.checked)">
                    </label>
                `;
            }).join('');
        },

        toggleAccessory: function(id, isChecked) {
            if (!AdminApp._currentAccessoryIds) AdminApp._currentAccessoryIds = new Set();
            if (isChecked) {
                AdminApp._currentAccessoryIds.add(id);
            } else {
                AdminApp._currentAccessoryIds.delete(id);
            }
        },

        addBulkPackRow: function(qty = '', price = '') {
            const container = document.getElementById('bulk-packs-container');
            if (!container) return;
            const row = document.createElement('div');
            row.className = 'bulk-pack-row';
            row.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr 36px; gap: 8px; align-items: center;';
            row.innerHTML = `
                <input type="number" class="bp-qty" min="2" step="1" placeholder="Qty (e.g. 2, 5, 10)" value="${qty}">
                <input type="number" class="bp-price" min="0" step="0.01" placeholder="Pack Price (₹)" value="${price}">
                <button type="button" class="btn-danger" onclick="this.parentElement.remove()" style="padding: 0; display: flex; align-items: center; justify-content: center; height: 38px; width: 36px; font-size: 16px;" title="Remove Tier">&times;</button>
            `;
            container.appendChild(row);
        },

        initProductsView: async function() {
            this.bindProductEvents();
            await this.loadCategories();
            await this.loadProducts();
        },

        loadCategories: async function() {
            const { data, error } = await supabase.from('categories').select('*').order('name');
            if (!error && data) this.state.categories = data;
        },

        loadProducts: async function() {
            document.getElementById('products-loading').classList.remove('hidden');
            const container = document.getElementById('products-management-container');
            if (container) container.innerHTML = ''; // clear while loading
            
            const { data, error } = await supabase
                .from('products')
                .select('*, categories(name)')
                .order('created_at', { ascending: false });
                
            document.getElementById('products-loading').classList.add('hidden');
            
            if (error) {
                if (container) container.innerHTML = `<p style="color:red">Failed to load products: ${error.message}</p>`;
                return;
            }
            
            this.state.products = data || [];
            this.renderProducts();
        },

        renderProducts: function() {
            const container = document.getElementById('products-management-container');
            if (!container) return;

            const invState = this.state.inventoryState;

            // 1. Render Toolbar only once so inputs don't lose focus
            if (!document.getElementById('inventory-list-wrapper')) {
                // Check which categories actually have products assigned to them
                const activeCatIds = new Set(this.state.products.map(p => p.category_id));
                const activeCategories = (this.state.categories || []).filter(c => activeCatIds.has(c.id));

                const toolbarHtml = `
                    <div class="inventory-toolbar">
                        <div class="inventory-filters">
                            <input type="text" placeholder="Search by name or category..." id="inv-search-input" value="${invState.search}" oninput="AdminApp.handleInventorySearch(this.value)">
                            <select id="inv-cat-filter" onchange="AdminApp.state.inventoryState.category = this.value; AdminApp.renderProducts();">
                                <option value="all">All Categories</option>
                                ${activeCategories.map(c => `<option value="${c.id}" ${invState.category === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
                            </select>
                            <select id="inv-status-filter" onchange="AdminApp.state.inventoryState.status = this.value; AdminApp.renderProducts();">
                                <option value="all" ${invState.status === 'all' ? 'selected' : ''}>All Status</option>
                                <option value="active" ${invState.status === 'active' ? 'selected' : ''}>Active</option>
                                <option value="inactive" ${invState.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                            </select>
                            <select id="inv-sort-filter" onchange="AdminApp.state.inventoryState.sort = this.value; AdminApp.renderProducts();">
                                <option value="newest" ${invState.sort === 'newest' ? 'selected' : ''}>Newest</option>
                                <option value="oldest" ${invState.sort === 'oldest' ? 'selected' : ''}>Oldest</option>
                                <option value="name-asc" ${invState.sort === 'name-asc' ? 'selected' : ''}>Name A-Z</option>
                                <option value="name-desc" ${invState.sort === 'name-desc' ? 'selected' : ''}>Name Z-A</option>
                                <option value="price-asc" ${invState.sort === 'price-asc' ? 'selected' : ''}>Price Low to High</option>
                                <option value="price-desc" ${invState.sort === 'price-desc' ? 'selected' : ''}>Price High to Low</option>
                            </select>
                        </div>
                        <div id="inventory-action-buttons" style="display: flex; gap: 8px;">
                            <button onclick="AdminApp.toggleQuickEdit()" id="btn-quick-edit" class="btn-secondary" style="width: auto; padding: 10px 16px;">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px; vertical-align: middle;"><polygon points="16 3 21 8 8 21 3 21 3 16 16 3"></polygon></svg> Quick Edit
                            </button>
                            <button onclick="AdminApp.openProductForm()" id="btn-add-product" class="btn-primary" style="width: auto; padding: 10px 16px;">+ Add Product</button>
                            <button onclick="AdminApp.saveQuickEdit()" id="btn-save-quick-edit" class="btn-primary hidden" style="background: var(--success); border-color: var(--success); width: auto; padding: 10px 16px;">Save Prices</button>
                        </div>
                    </div>
                    <div id="inventory-list-wrapper"></div>
                `;
                container.innerHTML = toolbarHtml;
            }

            // Phase 2: Manage Toolbar States for Quick Edit
            const btnQe = document.getElementById('btn-quick-edit');
            const btnAdd = document.getElementById('btn-add-product');
            const btnSaveQe = document.getElementById('btn-save-quick-edit');
            
            if (this.state.isQuickEditMode) {
                if(btnQe) { btnQe.textContent = 'Cancel Edit'; btnQe.style.background = '#fee2e2'; btnQe.style.color = 'var(--danger)'; btnQe.style.borderColor = '#fca5a5'; }
                if(btnAdd) btnAdd.classList.add('hidden');
                if(btnSaveQe) btnSaveQe.classList.remove('hidden');
            } else {
                if(btnQe) { btnQe.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px; vertical-align: middle;"><polygon points="16 3 21 8 8 21 3 21 3 16 16 3"></polygon></svg> Quick Edit'; btnQe.style.background = ''; btnQe.style.color = ''; btnQe.style.borderColor = ''; }
                if(btnAdd) btnAdd.classList.remove('hidden');
                if(btnSaveQe) btnSaveQe.classList.add('hidden');
            }

            const q = this.normalizeSearchText(invState.search);
            const queryTokens = q.split(' ').filter(t => t);

            let scoredProducts = this.state.products.map(p => {
                let matchesSearch = true;
                let score = 0;
                
                if (queryTokens.length > 0) {
                    if (!p._searchNormName) {
                        p._searchNormName = this.normalizeSearchText(p.name);
                        p._searchCat = (p.categories?.name || '').toLowerCase();
                    }
                    
                    // Pad with spaces to enforce exact word boundary matching
                    const paddedName = ` ${p._searchNormName} `;
                    const paddedCat = ` ${p._searchCat} `;
                    
                    let tokenMatches = 0;
                    
                    queryTokens.forEach(token => {
                        const paddedToken = ` ${token} `;
                        
                        if (paddedName.includes(paddedToken)) {
                            score += 10;
                            tokenMatches++;
                        } else if (paddedCat.includes(paddedToken)) {
                            score += 5;
                            tokenMatches++;
                        } else if (p._searchNormName.includes(token)) {
                            // Fix the 3W vs 23W bug: reject partial matches on tiny tokens
                            if (token.length > 2) {
                                score += 2;
                                tokenMatches++;
                            }
                        } else if (p._searchCat.includes(token)) {
                             if (token.length > 2) {
                                score += 1;
                                tokenMatches++;
                             }
                        }
                    });
                    
                    // Must successfully match ALL typed tokens to remain in the list
                    matchesSearch = (tokenMatches === queryTokens.length);
                }
                
                const matchesCat = invState.category === 'all' || p.category_id === invState.category;
                const matchesStatus = invState.status === 'all' || 
                                      (invState.status === 'active' && p.is_active) || 
                                      (invState.status === 'inactive' && !p.is_active);
                
                return { 
                    product: p, 
                    score: score, 
                    isValid: matchesSearch && matchesCat && matchesStatus 
                };
            });

            let filtered = scoredProducts.filter(x => x.isValid);

            // Sorting
            filtered.sort((a, b) => {
                // If actively searching, strictly sort by algorithm relevance score first
                if (queryTokens.length > 0 && b.score !== a.score) {
                    return b.score - a.score;
                }
                
                const pA = a.product;
                const pB = b.product;
                
                if (invState.sort === 'newest') return new Date(pB.created_at || 0) - new Date(pA.created_at || 0);
                if (invState.sort === 'oldest') return new Date(pA.created_at || 0) - new Date(pB.created_at || 0);
                if (invState.sort === 'name-asc') return pA.name.localeCompare(pB.name);
                if (invState.sort === 'name-desc') return pB.name.localeCompare(pA.name);
                if (invState.sort === 'price-asc') return (pA.selling_price || 0) - (pB.selling_price || 0);
                if (invState.sort === 'price-desc') return (pB.selling_price || 0) - (pA.selling_price || 0);
                return 0;
            });
            
            // Extract the raw products back out for HTML rendering
            filtered = filtered.map(x => x.product);

            let html = `
                <div style="margin-bottom: 12px; padding: 0 4px; font-size: 13px; font-weight: 600; color: var(--text-muted); display: flex; align-items: center; gap: 6px;">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
                    Total Products: <span style="color: var(--text-main); font-weight: 800;">${filtered.length}</span>
                </div>
            `;

            if (filtered.length === 0) {
                html += `<div style="text-align: center; padding: 40px; color: var(--text-muted); background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius);">No products found matching criteria.</div>`;
            } else {
                // Desktop Table
                html += `
                <div class="inventory-table-container desktop-only">
                    <table class="inventory-table">
                        <thead>
                            <tr>
                                <th style="width: 64px;">Thumb</th>
                                <th>Product</th>
                                <th>Category</th>
                                <th>Price</th>
                                <th>MRP</th>
                                <th>Status</th>
                                <th style="text-align: right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filtered.map(p => {
                                const thumb = p.image_urls?.[0] || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" background="%23f1f5f9"></svg>';
                                const cat = p.categories?.name || 'Unassigned';
                                let discountHtml = '';
                                if (p.mrp_price && p.mrp_price > p.selling_price) {
                                    const off = Math.round(((p.mrp_price - p.selling_price) / p.mrp_price) * 100);
                                    discountHtml = `<span style="color: var(--success); font-weight: bold; font-size: 12px; margin-left: 6px;">${off}% OFF</span>`;
                                }
                                return `
                                    <tr>
                                        <td>
                                            <img src="${thumb}" class="inventory-thumb" alt="">
                                        </td>
                                        <td>
                                            <span style="font-weight: 600; color: var(--text-main); white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.4;">${p.name}</span>
                                        </td>
                                        <td>${cat}</td>
                                        <td>
                                            ${this.state.isQuickEditMode ? 
                                                `<input type="number" step="0.01" class="quick-edit-input qe-price" data-id="${p.id}" value="${p.selling_price}" style="width: 80px; padding: 6px; border: 1px solid var(--border); border-radius: 4px; font-weight: bold;">` : 
                                                `<div style="font-weight: bold; font-size: 15px;">₹${p.selling_price} ${discountHtml}</div>`
                                            }
                                        </td>
                                        <td>
                                            ${this.state.isQuickEditMode ? 
                                                `<input type="number" step="0.01" class="quick-edit-input qe-mrp" data-id="${p.id}" value="${p.mrp_price || ''}" style="width: 80px; padding: 6px; border: 1px solid var(--border); border-radius: 4px;" placeholder="MRP">` : 
                                                `${(p.mrp_price && p.mrp_price > p.selling_price) ? `<span style="font-size: 13px; color: var(--text-muted);">MRP <span style="text-decoration: line-through;">₹${p.mrp_price}</span></span>` : '<span style="color: var(--text-muted);">--</span>'}`
                                            }
                                        </td>
                                        <td>
                                            <span class="status-badge ${p.is_active ? 'status-active' : 'status-inactive'}">
                                                ${p.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td style="text-align: right;">
                                            <button onclick="AdminApp.openProductForm('${p.id}')" title="Edit" style="background:none; border:none; cursor:pointer; padding:6px; color: var(--text-muted);">
                                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                            </button>
                                            <button onclick="AdminApp.deleteProduct('${p.id}')" title="Delete" style="background:none; border:none; cursor:pointer; padding:6px; color: var(--danger);">
                                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                            </button>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>

                <!-- Mobile List View -->
                <div class="mobile-only" style="background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden;">
                    ${filtered.map(p => {
                        const thumb = p.image_urls?.[0] || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" background="%23f1f5f9"></svg>';
                        const cat = p.categories?.name || 'Unassigned';
                        let discountHtml = '';
                        if (p.mrp_price && p.mrp_price > p.selling_price) {
                            const off = Math.round(((p.mrp_price - p.selling_price) / p.mrp_price) * 100);
                            discountHtml = `<span style="color: var(--success); font-weight: bold; font-size: 11px; margin-left: 6px;">${off}% OFF</span>`;
                        }
                        return `
                            <div class="mobile-inventory-card" style="padding: 12px; border-bottom: 1px solid var(--border); display: flex; gap: 12px; align-items: stretch;">
                                <img src="${thumb}" class="inventory-thumb" alt="" style="width: 60px; height: 60px; flex-shrink: 0; align-self: flex-start;">
                                <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between;">
                                    <div>
                                        <div style="font-weight: 600; font-size: 14px; color: var(--text-main); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.3;">${p.name}</div>
                                        <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">${cat}</div>
                                    </div>
                                    <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 8px;">
                                        ${this.state.isQuickEditMode ? 
                                            `₹<input type="number" step="0.01" class="quick-edit-input qe-price" data-id="${p.id}" value="${p.selling_price}" style="width: 70px; padding: 4px; border: 1px solid var(--border); border-radius: 4px; font-weight: bold;">
                                             <input type="number" step="0.01" class="quick-edit-input qe-mrp" data-id="${p.id}" value="${p.mrp_price || ''}" style="width: 70px; padding: 4px; border: 1px solid var(--border); border-radius: 4px;" placeholder="MRP">` : 
                                            `<span style="font-size: 15px; font-weight: 700; color: var(--text-main);">₹${p.selling_price}</span>
                                            ${(p.mrp_price && p.mrp_price > p.selling_price) ? `<span style="font-size: 12px; color: var(--text-muted);">MRP <span style="text-decoration: line-through;">₹${p.mrp_price}</span></span>` : ''}
                                            ${discountHtml}`
                                        }
                                    </div>
                                </div>
                                <div style="display: flex; flex-direction: column; justify-content: space-between; align-items: flex-end; flex-shrink: 0; width: 32px;">
                                    <span class="status-badge ${p.is_active ? 'status-active' : 'status-inactive'}" style="padding: 2px 6px; font-size: 9px; border-radius: 4px; margin-bottom: 8px; letter-spacing: 0;">
                                        ${p.is_active ? 'ON' : 'OFF'}
                                    </span>
                                    <div style="display: flex; flex-direction: column; gap: 4px;">
                                        <button onclick="AdminApp.openProductForm('${p.id}')" style="background:var(--bg-main); border:1px solid var(--border); border-radius:4px; cursor:pointer; padding:6px; color: var(--text-muted); display: flex; align-items: center; justify-content: center;">
                                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                        </button>
                                        <button onclick="AdminApp.deleteProduct('${p.id}')" style="background:var(--bg-main); border:1px solid var(--border); border-radius:4px; cursor:pointer; padding:6px; color: var(--danger); display: flex; align-items: center; justify-content: center;">
                                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                `;
            }

            document.getElementById('inventory-list-wrapper').innerHTML = html;
            setTimeout(() => CustomUI.styleSelects(), 0);
        },

        toggleQuickEdit: function() {
            this.state.isQuickEditMode = !this.state.isQuickEditMode;
            this.renderProducts();
        },

        saveQuickEdit: async function() {
            const btn = document.getElementById('btn-save-quick-edit');
            btn.textContent = 'Saving...';
            btn.disabled = true;

            const priceInputs = document.querySelectorAll('.qe-price');
            const mrpInputs = document.querySelectorAll('.qe-mrp');
            
            const updatesMap = new Map();

            // Gather all new prices (works for both mobile and desktop inputs safely)
            priceInputs.forEach(input => {
                const id = input.dataset.id;
                if (!updatesMap.has(id)) updatesMap.set(id, { id });
                updatesMap.get(id).selling_price = parseFloat(input.value) || 0;
            });

            mrpInputs.forEach(input => {
                const id = input.dataset.id;
                if (!updatesMap.has(id)) updatesMap.set(id, { id });
                updatesMap.get(id).mrp_price = parseFloat(input.value) || null;
            });

            const promises = [];
            let updatedCount = 0;

            for (const [id, data] of updatesMap) {
                const original = this.state.products.find(p => p.id === id);
                if (original) {
                    // Only perform database updates on products that were ACTUALLY changed
                    if (original.selling_price !== data.selling_price || original.mrp_price !== data.mrp_price) {
                        promises.push(supabase.from('products').update({ 
                            selling_price: data.selling_price, 
                            mrp_price: data.mrp_price 
                        }).eq('id', id));
                        updatedCount++;
                    }
                }
            }

            // Blast all changes to Supabase concurrently
            if (promises.length > 0) {
                await Promise.all(promises);
            }

            CustomUI.alert(`Successfully updated prices for ${updatedCount} products!`, 'Quick Edit Saved');
            
            this.state.isQuickEditMode = false;
            await this.loadProducts(); // Fully reload to lock in changes
        },

        bindProductEvents: function() {
            // Prevent duplicate binding
            if (this._productEventsBound) return;
            this._productEventsBound = true;

            const modal = document.getElementById('product-modal');
            const openBtn = document.getElementById('btn-open-product-modal');
            if (openBtn) openBtn.addEventListener('click', () => this.openProductForm());
            document.getElementById('btn-close-product-modal').addEventListener('click', () => modal.classList.add('hidden'));
            
            // Combobox Logic
            const searchInput = document.getElementById('product-category-search');
            const suggestList = document.getElementById('category-suggestions');
            
            searchInput.addEventListener('input', (e) => {
                const val = e.target.value.toLowerCase().trim();
                suggestList.innerHTML = '';
                if (!val) {
                    suggestList.classList.add('hidden');
                    document.getElementById('product-category-id').value = '';
                    return;
                }
                
                const matches = this.state.categories.filter(c => c.name.toLowerCase().includes(val));
                let html = matches.map(c => `<li data-id="${c.id}" data-name="${c.name}">${c.name}</li>`).join('');
                
                const exactMatch = matches.find(c => c.name.toLowerCase() === val);
                if (!exactMatch) {
                    // Automatically convert the user's input to Title Case
                    const titleCaseVal = val.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    html += `<li class="create-new" data-create="${titleCaseVal}">+ Create "${titleCaseVal}"</li>`;
                }
                
                suggestList.innerHTML = html;
                suggestList.classList.remove('hidden');
            });

            suggestList.addEventListener('click', async (e) => {
                const li = e.target.closest('li');
                if (!li) return;
                
                if (li.classList.contains('create-new')) {
                    const newCatName = li.dataset.create;
                    searchInput.value = 'Creating...';
                    suggestList.classList.add('hidden');
                    
                    const { data, error } = await supabase.from('categories').insert({ name: newCatName }).select().single();
                    if (!error && data) {
                        this.state.categories.push(data);
                        this.state.categories.sort((a,b) => a.name.localeCompare(b.name));
                        document.getElementById('product-category-id').value = data.id;
                        searchInput.value = data.name;
                    } else {
                        CustomUI.alert("Failed to create category: " + (error?.message || "Unknown error"), "Error");
                        searchInput.value = '';
                    }
                } else {
                    document.getElementById('product-category-id').value = li.dataset.id;
                    searchInput.value = li.dataset.name;
                    suggestList.classList.add('hidden');
                }
            });

            // Hide suggestions on outside click
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.combobox-container')) {
                    suggestList.classList.add('hidden');
                }
            });

            // Add Dynamic Bulk Pack Tier Row
            document.getElementById('btn-add-bulk-pack')?.addEventListener('click', () => {
                this.addBulkPackRow();
            });

            // Image Selection & Preview
            const imgInput = document.getElementById('product-images');
            imgInput.addEventListener('change', async (e) => {
                const files = Array.from(e.target.files);
                if (this.state.existingImages.length + this.state.pendingImages.length + files.length > 3) {
                    CustomUI.alert("Maximum 3 images allowed.", "Limit Reached");
                    imgInput.value = '';
                    return;
                }
                
                for (let file of files) {
                    const webpBlob = await this.compressToWebP(file);
                    this.state.pendingImages.push(webpBlob);
                }
                this.renderImagePreviews();
                imgInput.value = ''; // Reset
            });

            // Smart Link Suggestions on Name Type
            document.getElementById('product-name').addEventListener('input', () => {
                this.updateSmartLinkSuggestions();
            });

            // Accessory Search Suggestions
            const accSearch = document.getElementById('accessory-search-input');
            if(accSearch) {
                accSearch.addEventListener('input', () => {
                    this.updateAccessorySuggestions();
                });
            }

            // Auto MRP Logic
            document.getElementById('btn-auto-mrp').addEventListener('click', () => {
                const sellingPriceInput = document.getElementById('product-price').value;
                if (!sellingPriceInput) {
                    CustomUI.alert('Please enter a Selling Price first.', 'Missing Info');
                    return;
                }
                const sellingPrice = parseFloat(sellingPriceInput);
                // Calculate random increase between 20% (0.20) and 60% (0.60)
                const randomIncrease = (Math.random() * 0.40) + 0.20;
                const mrp = sellingPrice * (1 + randomIncrease);
                
                // Round to the nearest whole integer for a clean price tag
                document.getElementById('product-mrp').value = Math.round(mrp);
            });

            // Form Submit
            document.getElementById('product-form').addEventListener('submit', (e) => this.saveProduct(e));
            
            // Delete Product
            document.getElementById('btn-delete-product').addEventListener('click', () => this.deleteProduct());
        },

        openProductForm: function(idOrProduct = null) {
            document.getElementById('product-modal').classList.remove('hidden');
            document.getElementById('product-form-error').classList.add('hidden');
            document.getElementById('product-form').reset();
            
            this.state.pendingImages = [];
            this.state.existingImages = [];
            
            const delBtn = document.getElementById('btn-delete-product');
            const title = document.getElementById('product-modal-title');

            let product = null;
            if (typeof idOrProduct === 'string') {
                product = this.state.products.find(x => x.id === idOrProduct);
            } else {
                product = idOrProduct;
            }

            if (product) {
                title.textContent = 'Edit Product';
                delBtn.classList.remove('hidden');
                
                document.getElementById('product-id').value = product.id;
                document.getElementById('product-name').value = product.name;
                document.getElementById('product-category-id').value = product.category_id;
                document.getElementById('product-category-search').value = product.categories?.name || '';
                document.getElementById('product-price').value = product.selling_price;
                document.getElementById('product-mrp').value = product.mrp_price || '';
                
                // Phase 2: Smart Variant Engine Population
                const bpContainer = document.getElementById('bulk-packs-container');
                if (bpContainer) {
                    bpContainer.innerHTML = '';
                    const tiers = (product.bulk_packs && Array.isArray(product.bulk_packs) && product.bulk_packs.length > 0)
                        ? product.bulk_packs
                        : (product.pack_qty && product.pack_price ? [{ qty: product.pack_qty, price: product.pack_price }] : []);
                    
                    tiers.forEach(t => this.addBulkPackRow(t.qty, t.price));
                }

                if(document.getElementById('product-custom-options')) document.getElementById('product-custom-options').value = product.custom_options || '';
                
                AdminApp._currentLinkedIds = new Set(product.linked_product_ids || []);
                AdminApp._currentAccessoryIds = new Set(product.accessory_ids || []);
                if(document.getElementById('accessory-search-input')) document.getElementById('accessory-search-input').value = '';
                
                if (product.warranty) {
                    const parts = product.warranty.split(' ');
                    document.getElementById('product-warranty-val').value = parts[0] || '';
                    let unit = parts[1] || 'Year';
                    if (unit.endsWith('s')) unit = unit.slice(0, -1); // Strip the 's' for the dropdown
                    
                    const unitSelect = document.getElementById('product-warranty-unit');
                    unitSelect.value = unit;
                    
                    // Sync with your Custom UI Dropdown
                    const customOptions = unitSelect.nextElementSibling?.querySelectorAll('.custom-select-option');
                    if (customOptions) {
                        customOptions.forEach((opt, idx) => {
                            opt.classList.toggle('selected', unitSelect.selectedIndex === idx);
                            if (unitSelect.selectedIndex === idx) {
                                unitSelect.nextElementSibling.querySelector('span').textContent = opt.textContent;
                            }
                        });
                    }
                } else {
                    document.getElementById('product-warranty-val').value = '';
                    const unitSelect = document.getElementById('product-warranty-unit');
                    unitSelect.value = 'Year';
                    
                    const customOptions = unitSelect.nextElementSibling?.querySelectorAll('.custom-select-option');
                    if (customOptions) {
                        customOptions.forEach((opt, idx) => {
                            opt.classList.toggle('selected', idx === 0);
                            if (idx === 0) unitSelect.nextElementSibling.querySelector('span').textContent = opt.textContent;
                        });
                    }
                }

                document.getElementById('product-description').value = product.description || '';
                document.getElementById('product-active').checked = product.is_active;
                
                this.state.existingImages = product.image_urls || [];
            } else {
                title.textContent = 'Add Product';
                delBtn.classList.add('hidden');
                document.getElementById('product-id').value = '';
                document.getElementById('product-category-id').value = '';
                document.getElementById('product-warranty-val').value = '';
                
                // Clear Phase 2 Variant Engine fields on new product
                const bpContainerNew = document.getElementById('bulk-packs-container');
                if (bpContainerNew) bpContainerNew.innerHTML = '';
                if(document.getElementById('product-custom-options')) document.getElementById('product-custom-options').value = '';
                
                AdminApp._currentLinkedIds = new Set();
                AdminApp._currentAccessoryIds = new Set();
                if(document.getElementById('accessory-search-input')) document.getElementById('accessory-search-input').value = '';
            }
            this.renderImagePreviews();
            
            // Instantly sort the smart links based on the current product name
            this.updateSmartLinkSuggestions();
            this.updateAccessorySuggestions();
        },

        compressToWebP: function(file) {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const MAX_WIDTH = 1000; // Optimal mobile-first max size
                        let width = img.width;
                        let height = img.height;
                        if (width > MAX_WIDTH) {
                            height = Math.round((height * MAX_WIDTH) / width);
                            width = MAX_WIDTH;
                        }
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);
                        canvas.toBlob((blob) => resolve(blob), 'image/webp', 0.85);
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            });
        },

        renderImagePreviews: function() {
            const container = document.getElementById('image-preview-container');
            let html = '';
            
            // Existing Images
            this.state.existingImages.forEach((url, index) => {
                html += `
                    <div class="preview-box">
                        <img src="${url}">
                        <button type="button" class="remove-img" onclick="AdminApp.removeExistingImage(${index})">&times;</button>
                    </div>`;
            });
            
            // Pending Images
            this.state.pendingImages.forEach((blob, index) => {
                const url = URL.createObjectURL(blob);
                html += `
                    <div class="preview-box" style="border-color: var(--primary)">
                        <img src="${url}">
                        <button type="button" class="remove-img" onclick="AdminApp.removePendingImage(${index})">&times;</button>
                    </div>`;
            });
            
            container.innerHTML = html;
        },

        removeExistingImage: function(index) {
            this.state.existingImages.splice(index, 1);
            this.renderImagePreviews();
        },

        removePendingImage: function(index) {
            this.state.pendingImages.splice(index, 1);
            this.renderImagePreviews();
        },

        uploadPendingImages: async function() {
            const uploadedUrls = [];
            try {
                for (let blob of this.state.pendingImages) {
                    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.webp`;
                    const { data, error } = await supabase.storage.from('product-images').upload(fileName, blob, { contentType: 'image/webp' });
                    
                    if (error) throw error;
                    
                    const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fileName);
                    uploadedUrls.push(publicUrl);
                }
                return uploadedUrls;
            } catch (err) {
                // Rollback successfully uploaded parts if the batch fails halfway
                if (uploadedUrls.length > 0) {
                    const pathsToRemove = uploadedUrls.map(url => url.split('/product-images/')[1]).filter(Boolean);
                    if (pathsToRemove.length > 0) {
                        try {
                            await supabase.storage.from('product-images').remove(pathsToRemove);
                        } catch (rollbackErr) {
                            console.error('Failed to clean up partial upload:', rollbackErr);
                        }
                    }
                }
                throw new Error("Image upload failed: " + err.message);
            }
        },

        saveProduct: async function(e) {
            e.preventDefault();
            const btn = document.getElementById('btn-save-product');
            const errorEl = document.getElementById('product-form-error');
            
            const catId = document.getElementById('product-category-id').value;
            if (!catId) {
                errorEl.textContent = 'Please select or create a valid category from the dropdown.';
                errorEl.classList.remove('hidden');
                return;
            }

            btn.disabled = true;
            btn.textContent = 'Saving...';
            errorEl.classList.add('hidden');

            let newImageUrls = [];

            try {
                // 1. Upload new images
                newImageUrls = await this.uploadPendingImages();
                const finalImageUrls = [...this.state.existingImages, ...newImageUrls];

                // Auto format warranty string based on the numeric value
                let warrantyStr = null;
                const wVal = document.getElementById('product-warranty-val').value.trim();
                if (wVal && parseInt(wVal) > 0) {
                    const wUnit = document.getElementById('product-warranty-unit').value;
                    const unitStr = parseInt(wVal) === 1 ? wUnit : wUnit + 's';
                    warrantyStr = `${wVal} ${unitStr}`;
                }

                // 2. Prepare payload
                const linkedIds = AdminApp._currentLinkedIds ? Array.from(AdminApp._currentLinkedIds) : [];
                const accessoryIds = AdminApp._currentAccessoryIds ? Array.from(AdminApp._currentAccessoryIds) : [];

                // Collect dynamic bulk pack tiers FIRST
                const bulkPacks = [];
                document.querySelectorAll('.bulk-pack-row').forEach(row => {
                    const q = parseInt(row.querySelector('.bp-qty')?.value);
                    const p = parseFloat(row.querySelector('.bp-price')?.value);
                    if (q > 1 && !isNaN(p) && p > 0) {
                        bulkPacks.push({ qty: q, price: p });
                    }
                });
                bulkPacks.sort((a, b) => a.qty - b.qty);
                const primaryPack = bulkPacks[0] || null;

                const payload = {
                    name: document.getElementById('product-name').value.trim(),
                    category_id: catId,
                    selling_price: parseFloat(document.getElementById('product-price').value),
                    mrp_price: document.getElementById('product-mrp').value ? parseFloat(document.getElementById('product-mrp').value) : null,
                    warranty: warrantyStr,
                    description: document.getElementById('product-description').value.trim(),
                    is_active: document.getElementById('product-active').checked,
                    image_urls: finalImageUrls,
                    
                    // Smart Variant Engine Saving
                    pack_qty: primaryPack ? primaryPack.qty : null,
                    pack_price: primaryPack ? primaryPack.price : null,
                    bulk_packs: bulkPacks,
                    custom_options: document.getElementById('product-custom-options')?.value.trim() || null,
                    linked_product_ids: linkedIds,
                    accessory_ids: accessoryIds
                };

                const id = document.getElementById('product-id').value;
                const existingProduct = id ? this.state.products.find(x => x.id === id) : null;
                const oldImages = existingProduct ? (existingProduct.image_urls || []) : [];
                let res;

                if (id) {
                    res = await supabase.from('products').update(payload).eq('id', id).select().single();
                } else {
                    res = await supabase.from('products').insert(payload).select().single();
                }

                if (res.error) throw res.error;
                
                const savedProductId = res.data.id;

                // ---------------------------------------------------------
                // 3. SMART CLUSTER MULTI-DIRECTIONAL LINKING
                // ---------------------------------------------------------
                const clusterIds = [savedProductId, ...linkedIds];
                const promises = [];

                // A. Mutual Linking: Force all items in the cluster to point to each other
                for (const pid of linkedIds) {
                    const pToUpdate = this.state.products.find(x => x.id === pid);
                    if (pToUpdate) {
                        const existingLinks = pToUpdate.linked_product_ids || [];
                        const newLinksSet = new Set([...existingLinks, ...clusterIds]);
                        newLinksSet.delete(pid); // A product shouldn't link to itself
                        
                        const newLinksArray = Array.from(newLinksSet);
                        // Save DB calls: Only update if the links actually changed
                        if (existingLinks.length !== newLinksArray.length || !existingLinks.every(x => newLinksArray.includes(x))) {
                            promises.push(supabase.from('products').update({ linked_product_ids: newLinksArray }).eq('id', pid));
                        }
                    }
                }

                // B. Handle Detachment: If we unchecked a box, detach that product from the cluster
                if (id && existingProduct) {
                    const oldLinkedIds = existingProduct.linked_product_ids || [];
                    const removedIds = oldLinkedIds.filter(x => !linkedIds.includes(x));
                    
                    for (const rid of removedIds) {
                        const pToRemove = this.state.products.find(x => x.id === rid);
                        if (pToRemove) {
                            const existingLinks = pToRemove.linked_product_ids || [];
                            // Remove all members of the current active cluster from this detached item
                            const newLinksArray = existingLinks.filter(x => !clusterIds.includes(x));
                            
                            if (existingLinks.length !== newLinksArray.length) {
                                promises.push(supabase.from('products').update({ linked_product_ids: newLinksArray }).eq('id', rid));
                            }
                        }
                    }
                }

                // Execute all cross-link updates in parallel for maximum speed
                if (promises.length > 0) {
                    await Promise.all(promises);
                }

                // 4. ONLY AFTER DB SUCCESS: Clean up old storage images that are no longer referenced
                if (oldImages.length > 0) {
                    const imagesToDelete = oldImages.filter(oldUrl => !finalImageUrls.includes(oldUrl));
                    if (imagesToDelete.length > 0) {
                        const pathsToRemove = imagesToDelete.map(url => url.split('/product-images/')[1]).filter(Boolean);
                        if (pathsToRemove.length > 0) {
                            try {
                                await supabase.storage.from('product-images').remove(pathsToRemove);
                            } catch (err) {
                                console.warn('Failed to delete old orphan storage files:', err);
                            }
                        }
                    }
                }

                document.getElementById('product-modal').classList.add('hidden');
                await this.loadProducts(); // Refresh list

            } catch (err) {
                // ROLLBACK: If DB save fails, delete the newly uploaded images to prevent orphans
                if (newImageUrls.length > 0) {
                    const pathsToRemove = newImageUrls.map(url => url.split('/product-images/')[1]).filter(Boolean);
                    if (pathsToRemove.length > 0) {
                        try {
                            await supabase.storage.from('product-images').remove(pathsToRemove);
                        } catch (rollbackErr) {
                            console.error('Failed to rollback orphaned images:', rollbackErr);
                        }
                    }
                }
                errorEl.textContent = err.message || 'Failed to save product.';
                errorEl.classList.remove('hidden');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Save Product';
            }
        },

        deleteProduct: async function(idToDel = null) {
            if (!await CustomUI.confirm('Are you sure you want to delete this product? Historical orders will not be affected.', 'Delete Product')) return;
            
            const id = idToDel || document.getElementById('product-id').value;
            const product = this.state.products.find(p => p.id === id);
            const btn = document.getElementById('btn-delete-product');
            
            if (!idToDel) {
                btn.disabled = true;
                btn.textContent = 'Deleting...';
            }

            // 1. Delete from database
            const { error } = await supabase.from('products').delete().eq('id', id);
            
            if (error) {
                CustomUI.alert('Error deleting product: ' + error.message, 'Error');
                if (!idToDel) {
                    btn.disabled = false;
                    btn.textContent = 'Delete Product';
                }
            } else {
                // Clean up ghost links from cluster mates so they don't look for a deleted product
                if (product && product.linked_product_ids && product.linked_product_ids.length > 0) {
                    const promises = [];
                    for (const peerId of product.linked_product_ids) {
                        const peer = this.state.products.find(p => p.id === peerId);
                        if (peer) {
                            const newLinks = (peer.linked_product_ids || []).filter(x => x !== id);
                            promises.push(supabase.from('products').update({ linked_product_ids: newLinks }).eq('id', peerId));
                        }
                    }
                    if (promises.length > 0) await Promise.all(promises);
                }

                // 2. Only after DB success, clean up storage images
                if (product && product.image_urls && product.image_urls.length > 0) {
                    const pathsToRemove = product.image_urls.map(url => url.split('/product-images/')[1]).filter(Boolean);
                    if (pathsToRemove.length > 0) {
                        try {
                            await supabase.storage.from('product-images').remove(pathsToRemove);
                        } catch (err) {
                            console.warn('Failed to delete product storage images:', err);
                        }
                    }
                }
                
                document.getElementById('product-modal').classList.add('hidden');
                await this.loadProducts();
            }
        },

        // Marketplace Integration intentionally removed in Phase 1
    };

    // Attach AdminApp to window for inline onclick handlers inside dynamically generated HTML
    window.AdminApp = AdminApp;

    document.addEventListener('DOMContentLoaded', () => AdminApp.init());
})();