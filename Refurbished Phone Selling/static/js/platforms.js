// Platform management functionality
// platforms.js

class PlatformManager {
    constructor() {
        this.platforms = ['X', 'Y', 'Z'];
        this.phones = [];
        this.analysisData = [];
        
        this.init();
    }

    async init() {
        await this.loadPlatformSummary();
        await this.loadPhones();
        this.setupEventListeners();
        this.renderListings();
    }

    async loadPlatformSummary() {
        try {
            const response = await Utils.apiRequest('/api/platform-summary');
            this.updatePlatformMetrics(response);
        } catch (error) {
            console.error('Error loading platform summary:', error);
            Utils.showNotification('Failed to load platform data', 'error');
        }
    }

    async loadPhones() {
        try {
            const response = await Utils.apiRequest('/api/phones');
            this.phones = response;
        } catch (error) {
            console.error('Error loading phones:', error);
            Utils.showNotification('Failed to load phones', 'error');
        }
    }

    updatePlatformMetrics(summary) {
        Object.entries(summary).forEach(([platform, data]) => {
            const totalElement = document.getElementById(`platform-${platform.toLowerCase()}-total`);
            const listedElement = document.getElementById(`platform-${platform.toLowerCase()}-listed`);
            const priceElement = document.getElementById(`platform-${platform.toLowerCase()}-price`);

            if (totalElement) totalElement.textContent = data.total_phones;
            if (listedElement) listedElement.textContent = data.listed_phones;
            if (priceElement) priceElement.textContent = Utils.formatCurrency(data.avg_price);
        });
    }

    setupEventListeners() {
        // Platform filter
        const platformFilter = document.getElementById('platform-filter');
        if (platformFilter) {
            platformFilter.addEventListener('change', () => {
                this.renderListings();
            });
        }

        // Listing status filter
        const listingStatus = document.getElementById('listing-status');
        if (listingStatus) {
            listingStatus.addEventListener('change', () => {
                this.renderListings();
            });
        }

        // Search listings
        const searchListings = document.getElementById('search-listings');
        if (searchListings) {
            searchListings.addEventListener('input', Utils.debounce(() => {
                this.renderListings();
            }, 300));
        }
    }

    renderListings() {
        const tbody = document.getElementById('listings-tbody');
        if (!tbody) return;

        const platformFilter = document.getElementById('platform-filter');
        const listingStatus = document.getElementById('listing-status');
        const searchListings = document.getElementById('search-listings');

        const platformFilterValue = platformFilter ? platformFilter.value : '';
        const statusFilter = listingStatus ? listingStatus.value : '';
        const searchTerm = searchListings ? searchListings.value.toLowerCase() : '';

        let filteredPhones = this.phones.filter(phone => {
            const matchesSearch = !searchTerm || 
                phone.model_name.toLowerCase().includes(searchTerm) ||
                phone.brand.toLowerCase().includes(searchTerm);

            return matchesSearch;
        });

        tbody.innerHTML = filteredPhones.map(phone => `
            <tr>
                <td>
                    <div>
                        <strong>${phone.model_name}</strong><br>
                        <small>${phone.brand} • ${phone.condition}</small>
                    </div>
                </td>
                ${this.renderPlatformColumns(phone)}
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-primary" onclick="platformManager.quickList(${phone.id})">
                            <i class="fas fa-list"></i> Quick List
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    renderPlatformColumns(phone) {
        return this.platforms.map(platform => {
            const isListed = phone.platforms && phone.platforms[platform];
            const platformPrice = Utils.calculatePlatformPrice(phone.base_price, platform);
            const profit = platformPrice - phone.base_price;
            const canList = this.canListOnPlatform(phone, platform);

            if (!canList) {
                return `<td><span class="platform-status-badge unprofitable">Not Compatible</span></td>`;
            }

            return `
                <td>
                    <div class="platform-cell">
                        <span class="platform-status-badge ${isListed ? 'listed' : 'not-listed'}">
                            ${isListed ? 'Listed' : 'Not Listed'}
                        </span>
                        <div class="platform-pricing-small">
                            <small>${Utils.formatCurrency(platformPrice)}</small>
                            <small class="${profit >= 0 ? 'profit-positive' : 'profit-negative'}">
                                ${Utils.formatCurrency(profit)}
                            </small>
                        </div>
                        ${!isListed && canList ? `
                            <button class="btn btn-xs btn-success" onclick="platformManager.listOnPlatform(${phone.id}, '${platform}')">
                                List
                            </button>
                        ` : ''}
                    </div>
                </td>
            `;
        }).join('');
    }

    canListOnPlatform(phone, platform) {
        const conditionMapping = {
            'New': { 'X': true, 'Y': true, 'Z': true },
            'Excellent': { 'X': true, 'Y': true, 'Z': true },
            'Good': { 'X': true, 'Y': true, 'Z': true },
            'Fair': { 'X': true, 'Y': true, 'Z': true },
            'Poor': { 'X': true, 'Y': true, 'Z': false }
        };

        const compatible = conditionMapping[phone.condition] && conditionMapping[phone.condition][platform];
        const profitable = this.isProfitable(phone.base_price, platform);
        const inStock = phone.stock_quantity > 0;

        return compatible && profitable && inStock;
    }

    isProfitable(basePrice, platform, minMargin = 0.1) {
        const platformPrice = Utils.calculatePlatformPrice(basePrice, platform);
        const profit = platformPrice - basePrice;
        const margin = profit / basePrice;
        return margin >= minMargin;
    }

    async listOnPlatform(phoneId, platform) {
        try {
            const response = await Utils.apiRequest('/api/list-phone', {
                method: 'POST',
                body: JSON.stringify({
                    phone_id: phoneId,
                    platform: platform
                })
            });

            Utils.showNotification(response.message, 'success');
            await this.loadPhones();
            await this.loadPlatformSummary();
            this.renderListings();

        } catch (error) {
            console.error('Error listing phone:', error);
            Utils.showNotification(error.message || 'Failed to list phone', 'error');
        }
    }

    async quickList(phoneId) {
        const phone = this.phones.find(p => p.id === phoneId);
        if (!phone) return;

        // Find best platform for this phone
        let bestPlatform = null;
        let bestProfit = -Infinity;

        this.platforms.forEach(platform => {
            if (this.canListOnPlatform(phone, platform)) {
                const platformPrice = Utils.calculatePlatformPrice(phone.base_price, platform);
                const profit = platformPrice - phone.base_price;
                
                if (profit > bestProfit) {
                    bestProfit = profit;
                    bestPlatform = platform;
                }
            }
        });

        if (bestPlatform) {
            await this.listOnPlatform(phoneId, bestPlatform);
        } else {
            Utils.showNotification('No suitable platform found for this phone', 'error');
        }
    }

    async bulkList(platform) {
        if (!confirm(`List all compatible phones on Platform ${platform}?`)) {
            return;
        }

        try {
            const response = await Utils.apiRequest(`/api/platforms/${platform}/bulk-list`, {
                method: 'POST'
            });

            Utils.showNotification(response.message, 'success');
            await this.loadPhones();
            await this.loadPlatformSummary();
            this.renderListings();

        } catch (error) {
            console.error('Error bulk listing:', error);
            Utils.showNotification(error.message || 'Failed to bulk list phones', 'error');
        }
    }

    async updatePrices(platform) {
        if (!confirm(`Update all prices for Platform ${platform}?`)) {
            return;
        }

        try {
            const response = await Utils.apiRequest(`/api/platforms/${platform}/update-prices`, {
                method: 'POST'
            });

            Utils.showNotification(response.message, 'success');
            await this.loadPlatformSummary();

        } catch (error) {
            console.error('Error updating prices:', error);
            Utils.showNotification(error.message || 'Failed to update prices', 'error');
        }
    }

    async showProfitabilityAnalysis() {
        try {
            const response = await Utils.apiRequest('/api/analysis/profitability');
            this.analysisData = response;
            this.renderProfitabilityAnalysis();
            ModalManager.show('profitability-modal');

        } catch (error) {
            console.error('Error loading profitability analysis:', error);
            Utils.showNotification('Failed to load analysis', 'error');
        }
    }

    renderProfitabilityAnalysis() {
        const analysisBody = document.getElementById('analysis-tbody');
        if (!analysisBody) return;

        analysisBody.innerHTML = this.analysisData.map(phone => {
            const platforms = phone.platforms;
            let bestPlatform = null;
            let bestProfit = -Infinity;

            // Find best platform
            Object.entries(platforms).forEach(([platform, data]) => {
                if (data.profitable && data.profit > bestProfit) {
                    bestProfit = data.profit;
                    bestPlatform = platform;
                }
            });

            return `
                <tr>
                    <td>
                        <strong>${phone.model_name}</strong><br>
                        <small>${phone.brand}</small>
                    </td>
                    <td>${Utils.formatCurrency(phone.base_price)}</td>
                    ${this.platforms.map(platform => {
                        const data = platforms[platform];
                        return `
                            <td>
                                <div class="analysis-cell">
                                    <div class="platform-price">${Utils.formatCurrency(data.price)}</div>
                                    <div class="profit ${data.profitable ? 'profit-positive' : 'profit-negative'}">
                                        ${Utils.formatCurrency(data.profit)} (${data.profit_margin.toFixed(1)}%)
                                    </div>
                                    ${data.listed ? '<small class="listed-indicator">Listed</small>' : ''}
                                </div>
                            </td>
                        `;
                    }).join('')}
                    <td>
                        ${bestPlatform ? `
                            <strong>Platform ${bestPlatform}</strong><br>
                            <small>${Utils.formatCurrency(bestProfit)} profit</small>
                        ` : '<span class="text-danger">None profitable</span>'}
                    </td>
                </tr>
            `;
        }).join('');

        // Update summary stats
        this.updateAnalysisSummary();
    }

    updateAnalysisSummary() {
        const profitableStats = document.getElementById('profitable-stats');
        const unprofitableStats = document.getElementById('unprofitable-stats');

        if (!profitableStats || !unprofitableStats) return;

        let profitableCount = 0;
        let unprofitableCount = 0;
        let totalProfitableRevenue = 0;
        let totalUnprofitableRevenue = 0;

        this.analysisData.forEach(phone => {
            let hasProfitablePlatform = false;
            let maxRevenue = 0;

            Object.values(phone.platforms).forEach(platform => {
                if (platform.profitable) {
                    hasProfitablePlatform = true;
                    maxRevenue = Math.max(maxRevenue, platform.price);
                }
            });

            if (hasProfitablePlatform) {
                profitableCount++;
                totalProfitableRevenue += maxRevenue;
            } else {
                unprofitableCount++;
                totalUnprofitableRevenue += phone.base_price;
            }
        });

        profitableStats.innerHTML = `
            <div class="stat-row">
                <span>Products:</span>
                <span><strong>${profitableCount}</strong></span>
            </div>
            <div class="stat-row">
                <span>Potential Revenue:</span>
                <span><strong>${Utils.formatCurrency(totalProfitableRevenue)}</strong></span>
            </div>
            <div class="stat-row">
                <span>Avg Revenue:</span>
                <span><strong>${Utils.formatCurrency(profitableCount > 0 ? totalProfitableRevenue / profitableCount : 0)}</strong></span>
            </div>
        `;

        unprofitableStats.innerHTML = `
            <div class="stat-row">
                <span>Products:</span>
                <span><strong>${unprofitableCount}</strong></span>
            </div>
            <div class="stat-row">
                <span>Value:</span>
                <span><strong>${Utils.formatCurrency(totalUnprofitableRevenue)}</strong></span>
            </div>
            <div class="stat-row">
                <span>Avg Value:</span>
                <span><strong>${Utils.formatCurrency(unprofitableCount > 0 ? totalUnprofitableRevenue / unprofitableCount : 0)}</strong></span>
            </div>
        `;
    }
}

// Global functions for platform management
async function bulkList(platform) {
    if (window.platformManager) {
        await window.platformManager.bulkList(platform);
    }
}

async function updatePrices(platform) {
    if (window.platformManager) {
        await window.platformManager.updatePrices(platform);
    }
}

async function showProfitabilityAnalysis() {
    if (window.platformManager) {
        await window.platformManager.showProfitabilityAnalysis();
    }
}

function closeProfitabilityModal() {
    ModalManager.hide('profitability-modal');
}

// Initialize platform manager when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    window.platformManager = new PlatformManager();
});