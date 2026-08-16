const SESSION_CACHE_KEYS = {
    mediaIndex: 'food:media-index:v13'
};

const LOCAL_STORAGE_KEYS = {
    selected: 'food_rec_selected_places',
    honorable: 'food_rec_honorable_mentions',
    casual: 'food_rec_casual_places',
    dayToDay: 'food_rec_day_to_day',
    hidden: 'food_rec_hidden_restaurants',
    source: 'food_rec_data_source'
};

const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
let selectedPlaces = [];
let casualPlaces = [];
let dayToDayPlaces = [];
let honorableMentions = [];
let hiddenRestaurants = [];
let mediaIndex = {};
let currentSlideIndex = 0;
let currentRestaurantMedia = [];
let currentRestaurantName = '';
let editingRestaurantName = null;
let currentView = 'selected';
let currentCategoryFilters = new Set(['selected']);
let currentCityFilters = new Set();
let restaurantIndex = new Map();
let restaurantsBySource = {
    selected: [],
    honorable: [],
    casual: [],
    all: []
};
let viewGridMap = new Map();
let gridImageObserver = null;
let gridInteractionsBound = false;
const preloadedCarouselMedia = new Set();

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await Promise.all([loadMediaIndex(), loadRestaurantData()]);
    } catch (error) {
        console.error('Error during initialization:', error);
    }

    rebuildRestaurantStore();
    renderCityFilter();
    renderRestaurants();
    setupEventListeners();
    setupAdminPanel();
});

async function loadCachedJson(cacheKey, url) {
    try {
        const cached = window.sessionStorage.getItem(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }
    } catch (error) {
        console.warn('Session storage unavailable for', cacheKey, error);
    }

    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Failed to load ${url}`);
    }

    const data = await response.json();

    try {
        window.sessionStorage.setItem(cacheKey, JSON.stringify(data));
    } catch (error) {
        console.warn('Unable to store session cache for', cacheKey, error);
    }

    return data;
}

async function loadFreshJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Failed to load ${url}`);
    }

    return response.json();
}

function loadStoredArray(key) {
    try {
        const rawValue = window.localStorage.getItem(key);
        if (!rawValue) {
            return null;
        }

        const parsed = JSON.parse(rawValue);
        return Array.isArray(parsed) ? parsed : null;
    } catch (error) {
        console.warn('Unable to read saved data for', key, error);
        return null;
    }
}

function getRestaurantDataSource() {
    try {
        return window.localStorage.getItem(LOCAL_STORAGE_KEYS.source) || 'json';
    } catch (error) {
        console.warn('Unable to read restaurant data source', error);
        return 'json';
    }
}

function setRestaurantDataSource(source) {
    try {
        if (source === 'local') {
            window.localStorage.setItem(LOCAL_STORAGE_KEYS.source, 'local');
            return;
        }

        window.localStorage.removeItem(LOCAL_STORAGE_KEYS.source);
    } catch (error) {
        console.warn('Unable to store restaurant data source', error);
    }
}

function clearLegacyRestaurantSessionCache() {
    try {
        window.sessionStorage.removeItem('food:selected');
        window.sessionStorage.removeItem('food:honorable');
        window.sessionStorage.removeItem('food:casual');
    } catch (error) {
        console.warn('Unable to clear legacy restaurant session cache', error);
    }
}

async function loadMediaIndex() {
    try {
        mediaIndex = await loadCachedJson(SESSION_CACHE_KEYS.mediaIndex, 'media_index.json');
    } catch (error) {
        console.warn('Could not load media index, carousel will fall back to cover images', error);
        mediaIndex = {};
    }
}

async function loadRestaurantData() {
    try {
        clearLegacyRestaurantSessionCache();

        const storedHidden = loadStoredArray(LOCAL_STORAGE_KEYS.hidden);
        const storedDayToDay = loadStoredArray(LOCAL_STORAGE_KEYS.dayToDay);

        hiddenRestaurants = storedHidden || [];
        dayToDayPlaces = storedDayToDay || [];

        if (getRestaurantDataSource() === 'local') {
            const storedSelected = loadStoredArray(LOCAL_STORAGE_KEYS.selected);
            const storedHonorable = loadStoredArray(LOCAL_STORAGE_KEYS.honorable);
            const storedCasual = loadStoredArray(LOCAL_STORAGE_KEYS.casual);

        if (Array.isArray(storedSelected) && Array.isArray(storedHonorable)) {
            selectedPlaces = storedSelected;
            honorableMentions = storedHonorable;
            if (Array.isArray(storedCasual)) {
                casualPlaces = storedCasual;
                } else {
                    try {
                        casualPlaces = await loadFreshJson('casual.json');
                    } catch (casualError) {
                        console.warn('Could not load casual.json, falling back to an empty casual list', casualError);
                    casualPlaces = [];
                }
            }
            migrateRestaurantsToHonorable();
            migrateRestaurantMedia();
            saveRestaurants();
            return;
        }

            setRestaurantDataSource('json');
        }

        const [selected, honorable, casual] = await Promise.all([
            loadFreshJson('selected_places.json'),
            loadFreshJson('honorable_mentions.json'),
            loadFreshJson('casual.json')
        ]);

        selectedPlaces = selected;
        honorableMentions = honorable;
        casualPlaces = casual;
        migrateRestaurantsToHonorable();
        migrateRestaurantMedia();
    } catch (error) {
        console.error('Error loading restaurant data:', error);
        selectedPlaces = [];
        casualPlaces = [];
        honorableMentions = [];
        hiddenRestaurants = [];
        dayToDayPlaces = [];
    }
}

function rebuildRestaurantStore() {
    const selectedStore = selectedPlaces.map((restaurant, index) => prepareRestaurantData(restaurant, 'selected', index));
    const honorableStore = honorableMentions.map((restaurant, index) => prepareRestaurantData(restaurant, 'honorable', index));
    const casualStore = casualPlaces.map((restaurant, index) => prepareRestaurantData(restaurant, 'casual', index));
    const allStore = [...selectedStore, ...honorableStore, ...casualStore];

    restaurantsBySource = {
        selected: selectedStore,
        honorable: honorableStore,
        casual: casualStore,
        all: allStore
    };

    restaurantIndex = new Map(allStore.map((restaurant) => [restaurant.id, restaurant]));
    resetRestaurantGrid();
}

function resetRestaurantGrid() {
    const grid = document.getElementById('restaurantGrid');
    if (grid) {
        grid.innerHTML = '';
    }

    viewGridMap = new Map();

    if (gridImageObserver) {
        gridImageObserver.disconnect();
        gridImageObserver = null;
    }
}

function prepareRestaurantData(restaurant, source, index) {
    const idBase = slugifyRestaurantName(restaurant.name) || `${source}-${index}`;
    const city = extractCityFromLocation(restaurant.location);

    return {
        ...restaurant,
        source,
        id: `${source}-${idBase}-${index}`,
        city,
        cityKey: normalizeFilterValue(city),
        photos: getRestaurantPhotos(restaurant),
        cardElement: null
    };
}

function getCurrentViewRestaurants() {
    return restaurantsBySource[currentView] || restaurantsBySource.selected || [];
}

function normalizeFilterValue(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function extractCityFromLocation(location) {
    const normalizedLocation = String(location || '').trim();
    if (!normalizedLocation) {
        return '';
    }

    const [city] = normalizedLocation.split(',');
    return city ? city.trim() : normalizedLocation;
}

function getCityFilterOptions() {
    const cityMap = new Map();

    getCurrentViewRestaurants().forEach((restaurant) => {
        const city = extractCityFromLocation(restaurant.location);
        if (!city) {
            return;
        }

        const key = normalizeFilterValue(city);
        const existing = cityMap.get(key);
        if (existing) {
            existing.count += 1;
            return;
        }

        cityMap.set(key, {
            key,
            label: city,
            count: 1
        });
    });

    return Array.from(cityMap.values()).sort((a, b) => {
        if (a.count !== b.count) {
            return b.count - a.count;
        }

        return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    });
}

function getSelectedCityFilterLabels() {
    const cityOptions = getCityFilterOptions();
    const selectedCityKeys = new Set(currentCityFilters);

    return cityOptions
        .filter((option) => selectedCityKeys.has(option.key))
        .map((option) => option.label);
}

function getSelectedCategoryFilterLabels() {
    const labels = [];

    if (currentCategoryFilters.has('selected')) {
        labels.push('Selected Places');
    }

    if (currentCategoryFilters.has('honorable')) {
        labels.push('Honorable Mentions');
    }

    if (currentCategoryFilters.has('casual')) {
        labels.push('Casual Places');
    }

    return labels;
}

function formatCityListForMessage(cityLabels) {
    if (cityLabels.length <= 3) {
        return cityLabels.join(', ');
    }

    return `${cityLabels.slice(0, 3).join(', ')} and ${cityLabels.length - 3} more`;
}

function getCityFilterSummaryText() {
    const selectedCityLabels = getSelectedCityFilterLabels();

    if (selectedCityLabels.length === 0) {
        return 'All Cities';
    }

    if (selectedCityLabels.length === 1) {
        return selectedCityLabels[0];
    }

    return `${selectedCityLabels.length} cities selected`;
}

function getCollectionViewTheme() {
    if (currentCategoryFilters.size !== 1) {
        return 'all';
    }

    if (currentCategoryFilters.has('selected')) {
        return 'selected';
    }

    if (currentCategoryFilters.has('honorable')) {
        return 'honorable';
    }

    return 'all';
}

function syncCategoryFilterButtons() {
    document.querySelectorAll('.view-btn').forEach((button) => {
        const view = button.dataset.view || '';
        const isActive = currentCategoryFilters.has(view);
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });
}

function renderCityFilter() {
    const dropdown = document.getElementById('cityFilterDropdown');
    const menu = document.getElementById('cityFilterOptions');
    const summaryLabel = document.getElementById('cityFilterTriggerLabel');
    const clearButton = document.getElementById('clearCityFilter');

    if (!dropdown || !menu || !summaryLabel) {
        return;
    }

    const availableCityOptions = getCityFilterOptions();
    const availableCityKeys = new Set(availableCityOptions.map((option) => option.key));
    const filteredSelections = Array.from(currentCityFilters).filter((key) => availableCityKeys.has(key));

    if (filteredSelections.length > 1) {
        currentCityFilters = new Set([filteredSelections[0]]);
    } else if (filteredSelections.length !== currentCityFilters.size) {
        currentCityFilters = new Set(filteredSelections);
    }

    summaryLabel.textContent = getCityFilterSummaryText();
    summaryLabel.title = getSelectedCityFilterLabels().join(', ') || 'All Cities';

    if (clearButton) {
        clearButton.disabled = currentCityFilters.size === 0;
    }

    menu.innerHTML = '';

    if (availableCityOptions.length === 0) {
        const emptyState = document.createElement('p');
        emptyState.className = 'food-city-empty';
        emptyState.textContent = 'No cities available.';
        menu.appendChild(emptyState);
        return;
    }

    availableCityOptions.forEach((option) => {
        const label = document.createElement('label');
        label.className = 'food-city-option';

        const cityInput = document.createElement('input');
        cityInput.type = 'radio';
        cityInput.name = 'city-filter';
        cityInput.checked = currentCityFilters.has(option.key);
        cityInput.setAttribute('aria-label', option.label);
        label.classList.toggle('active', cityInput.checked);

        const cityName = document.createElement('span');
        cityName.className = 'food-city-option-name';
        cityName.textContent = option.label;
        label.appendChild(cityInput);
        label.appendChild(cityName);

        cityInput.addEventListener('change', () => {
            if (cityInput.checked) {
                currentCityFilters = new Set([option.key]);
            }

            renderCityFilter();
            renderRestaurants();
        });
        menu.appendChild(label);
    });
}

function getFilteredRestaurants() {
    const restaurants = getCurrentViewRestaurants();
    const hasCityFilters = currentCityFilters.size > 0;

    return restaurants.filter((restaurant) => {
        if (hasCityFilters) {
            const restaurantCityKey = restaurant.cityKey || normalizeFilterValue(extractCityFromLocation(restaurant.location));
            if (!currentCityFilters.has(restaurantCityKey)) {
                return false;
            }
        }

        return true;
    });
}

function syncFoodViewTheme() {
    if (!document.body || !document.body.classList.contains('food-page')) {
        return;
    }

    document.body.dataset.collectionView = currentView;
}

function renderRestaurants() {
    const grid = document.getElementById('restaurantGrid');
    const noResults = document.getElementById('noResults');

    if (!grid || !noResults) {
        return;
    }

    syncFoodViewTheme();
    syncCategoryFilterButtons();

    const filteredRestaurants = getFilteredRestaurants();
    const activeGrid = ensureViewGridBuilt(grid, currentView);

    const visibleRestaurantIds = new Set(filteredRestaurants.map((restaurant) => restaurant.id));

    getCurrentViewRestaurants().forEach((restaurant) => {
        if (restaurant.cardElement) {
            restaurant.cardElement.hidden = !visibleRestaurantIds.has(restaurant.id);
        }
    });

    viewGridMap.forEach((panel, view) => {
        panel.hidden = view !== currentView;
    });

    const hasResults = filteredRestaurants.length > 0;
    if (activeGrid) {
        activeGrid.hidden = !hasResults;
    }
    noResults.style.display = hasResults ? 'none' : 'block';
    updateNoResultsMessage();

    updateSummary(filteredRestaurants.length);
}

function ensureViewGridBuilt(container, view) {
    if (!container) {
        return null;
    }

    if (viewGridMap.has(view)) {
        return viewGridMap.get(view);
    }

    const panel = document.createElement('div');
    panel.className = 'restaurant-grid-panel';
    panel.dataset.view = view;
    panel.hidden = false;

    const fragment = document.createDocumentFragment();
    (restaurantsBySource[view] || []).forEach((restaurant) => {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = renderCompactCardMarkup(restaurant);
        restaurant.cardElement = wrapper.firstElementChild;
        fragment.appendChild(restaurant.cardElement);
    });

    panel.appendChild(fragment);
    container.appendChild(panel);
    viewGridMap.set(view, panel);
    setupCardImageLoading(panel);

    return panel;
}

function renderCompactCardMarkup(restaurant) {
    const hasNotes = Boolean(restaurant.notes && restaurant.notes.trim());
    const description = restaurant.description || 'Recommendation coming soon.';
    const location = restaurant.location || 'Location unavailable';
    const actions = [];

    if (restaurant.map) {
        actions.push(`<a class="detail-link strong-action" href="${escapeAttr(restaurant.map)}" target="_blank" rel="noreferrer">📍 Map</a>`);
    }
    if (hasNotes) {
        actions.push(`<button type="button" class="detail-link detail-link-button note-trigger" data-toggle-notes aria-expanded="false">Notes</button>`);
    }

    return `
        <article class="restaurant-card compact-restaurant-card">
            <div class="card-media-frame">
                ${restaurant.photo ? `
                    <button type="button" class="card-media card-media-button" data-open-carousel data-restaurant-id="${escapeAttr(restaurant.id)}" data-start-index="0" aria-label="Open pictures for ${escapeAttr(restaurant.name)}">
                        <img class="lazy-card-image" src="${TRANSPARENT_PIXEL}" data-src="${escapeAttr(restaurant.photo)}" alt="${escapeAttr(restaurant.name)}" loading="lazy" decoding="async" fetchpriority="low" width="400" height="300">
                    </button>
                ` : `
                    <div class="card-media card-media-empty" aria-hidden="true">
                        <div class="placeholder-image compact-placeholder">No photo available</div>
                    </div>
                `}
            </div>
            <div class="card-content compact-card-content">
                <div class="card-head">
                    <div class="card-head-copy">
                        <h2 class="restaurant-name">${escapeHtml(restaurant.name)}</h2>
                        <div class="restaurant-location">${escapeHtml(location)}</div>
                    </div>
                </div>
                <div class="tag-row">
                    <span class="tag">${escapeHtml(titleizeCuisine(restaurant.cuisine || 'unknown'))}</span>
                </div>
                <p class="description compact-description">${escapeHtml(description)}</p>
                ${actions.length ? `<div class="compact-actions">${actions.join('')}</div>` : ''}
                ${hasNotes ? `<div class="compact-note-panel" hidden><p class="muted-note compact-note">${escapeHtml(restaurant.notes)}</p></div>` : ''}
            </div>
        </article>
    `;
}

function updateSummary(count) {
    const summaryCount = document.getElementById('summaryCount');

    if (summaryCount) {
        summaryCount.textContent = `${count} restaurant${count === 1 ? '' : 's'}`;
    }
}

function updateNoResultsMessage() {
    const noResultsMessage = document.querySelector('#noResults p');

    if (!noResultsMessage) {
        return;
    }

    const cityLabels = getSelectedCityFilterLabels();

    if (cityLabels.length) {
        noResultsMessage.textContent = `No restaurants found in ${formatCityListForMessage(cityLabels)}. Try a different city or clear the city filter.`;
        return;
    }

    noResultsMessage.textContent = 'No restaurants found. Try adjusting your filters!';
}

function getRestaurantMediaKey(restaurant) {
    const nameSlug = slugifyRestaurantName(restaurant.name);

    if (nameSlug && mediaIndex[nameSlug]) {
        return nameSlug;
    }

    if (restaurant.photo) {
        const photoParts = restaurant.photo.split('/');
        if (photoParts.length >= 3) {
            const folderSlug = photoParts[1];
            if (mediaIndex[folderSlug]) {
                return folderSlug;
            }
        }
    }

    return nameSlug;
}

function getRestaurantPhotos(restaurant) {
    const mediaKey = getRestaurantMediaKey(restaurant);
    const indexedPhotos = mediaKey ? (mediaIndex[mediaKey] || []) : [];
    const hiddenImages = Array.isArray(restaurant.hiddenImages) ? restaurant.hiddenImages : [];
    const mergedPhotos = [...indexedPhotos];

    if (restaurant.photo) {
        mergedPhotos.unshift(restaurant.photo);
    }

    return Array.from(new Set(mergedPhotos)).filter((photo) => photo && !hiddenImages.includes(photo));
}

function slugifyRestaurantName(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function titleizeCuisine(cuisine) {
    return String(cuisine || '')
        .split(/[\s-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function moveRestaurantBetweenCollections(restaurantName, sourceCollection, targetCollection) {
    const sourceIndex = sourceCollection.findIndex((restaurant) => restaurant.name === restaurantName);
    if (sourceIndex === -1) {
        return false;
    }

    const [restaurant] = sourceCollection.splice(sourceIndex, 1);
    if (!targetCollection.some((candidate) => candidate.name === restaurantName)) {
        targetCollection.push(restaurant);
    }

    return true;
}

function migrateRestaurantsToHonorable() {
    const movedIyoExperienceFromCasual = moveRestaurantBetweenCollections('IYO Experience', casualPlaces, honorableMentions);
    const movedIyoExperienceFromDayToDay = moveRestaurantBetweenCollections('IYO Experience', dayToDayPlaces, honorableMentions);
    const movedMimiAllaFerroviaFromCasual = moveRestaurantBetweenCollections('Mimi alla ferrovia', casualPlaces, honorableMentions);
    const movedMimiAllaFerroviaFromDayToDay = moveRestaurantBetweenCollections('Mimi alla ferrovia', dayToDayPlaces, honorableMentions);
    const movedOkonomiyakiSakabaOFromCasual = moveRestaurantBetweenCollections('Okonomiyaki Sakaba O', casualPlaces, honorableMentions);
    const movedOkonomiyakiSakabaOFromDayToDay = moveRestaurantBetweenCollections('Okonomiyaki Sakaba O', dayToDayPlaces, honorableMentions);
    const movedSushiDaigoFromCasual = moveRestaurantBetweenCollections('Sushi Daigo', casualPlaces, honorableMentions);
    const movedSushiDaigoFromDayToDay = moveRestaurantBetweenCollections('Sushi Daigo', dayToDayPlaces, honorableMentions);
    const movedBraceriaBifulcoFromDayToDay = moveRestaurantBetweenCollections('Braceria Bifulco', dayToDayPlaces, honorableMentions);
    const movedBraceriaBifulcoFromCasual = moveRestaurantBetweenCollections('Braceria Bifulco', casualPlaces, honorableMentions);
    const movedRaku = moveRestaurantBetweenCollections('Raku', casualPlaces, honorableMentions);
    const movedUnaPizza = moveRestaurantBetweenCollections('Una Pizza Napoletana', casualPlaces, honorableMentions);
    const movedSmithAndWollensky = moveRestaurantBetweenCollections('Smith and Wollensky', casualPlaces, honorableMentions);
    const movedUmbertoAMare = moveRestaurantBetweenCollections('Umberto a mare', casualPlaces, honorableMentions);

    return movedIyoExperienceFromCasual
        || movedIyoExperienceFromDayToDay
        || movedMimiAllaFerroviaFromCasual
        || movedMimiAllaFerroviaFromDayToDay
        || movedOkonomiyakiSakabaOFromCasual
        || movedOkonomiyakiSakabaOFromDayToDay
        || movedSushiDaigoFromCasual
        || movedSushiDaigoFromDayToDay
        || movedBraceriaBifulcoFromDayToDay
        || movedBraceriaBifulcoFromCasual
        || movedRaku
        || movedUnaPizza
        || movedSmithAndWollensky
        || movedUmbertoAMare;
}

function migrateRestaurantPhoto(name, newPhoto, collections) {
    return collections.reduce((migrated, collection) => {
        const restaurant = collection.find((entry) => entry.name === name);
        if (!restaurant || restaurant.photo === newPhoto) {
            return migrated;
        }

        restaurant.photo = newPhoto;
        return true;
    }, false);
}

function migrateRestaurantMedia() {
    const migratedMargheri = migrateRestaurantPhoto('Margherì', 'images/margher/media-3.jpg', [casualPlaces, dayToDayPlaces]);
    const migratedSoothr = migrateRestaurantPhoto('Soothr', 'images/soothr/IMG_5080.jpeg', [selectedPlaces]);
    const migratedMonkeyBar = migrateRestaurantPhoto('Monkey Bar', 'images/monkey-bar/IMG_5076.jpeg', [selectedPlaces]);

    return migratedMargheri || migratedSoothr || migratedMonkeyBar;
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
}

function setupCardImageLoading(root) {
    const images = root.querySelectorAll('.lazy-card-image[data-src]');
    if (!images.length) {
        return;
    }

    if (!('IntersectionObserver' in window)) {
        images.forEach(loadCardImage);
        return;
    }

    if (!gridImageObserver) {
        gridImageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                loadCardImage(entry.target);
                observer.unobserve(entry.target);
            });
        }, {
            rootMargin: '300px 0px'
        });
    }

    images.forEach((image) => {
        gridImageObserver.observe(image);
    });
}

function loadCardImage(image) {
    const src = image.dataset.src;
    if (!src) {
        return;
    }

    image.addEventListener('load', () => {
        image.classList.add('loaded');
    }, { once: true });

    image.src = src;
    image.removeAttribute('data-src');
}

function findRestaurantByName(name) {
    return selectedPlaces.find((restaurant) => restaurant.name === name)
        || honorableMentions.find((restaurant) => restaurant.name === name)
        || casualPlaces.find((restaurant) => restaurant.name === name)
        || hiddenRestaurants.find((restaurant) => restaurant.name === name)
        || dayToDayPlaces.find((restaurant) => restaurant.name === name);
}

function openCarousel(restaurantName, startIndex = 0) {
    const restaurant = findRestaurantByName(restaurantName);
    if (!restaurant) {
        console.error('Restaurant not found:', restaurantName);
        return;
    }

    openCarouselForRestaurant(restaurant, startIndex);
}

function openCarouselForRestaurant(restaurant, startIndex = 0) {
    const photos = Array.isArray(restaurant.photos) && restaurant.photos.length
        ? restaurant.photos
        : getRestaurantPhotos(restaurant);

    currentRestaurantMedia = photos.length > 0
        ? photos
        : (restaurant.photo ? [restaurant.photo] : []);
    currentRestaurantName = restaurant.name || 'Pictures';
    currentSlideIndex = Math.max(0, Math.min(startIndex, currentRestaurantMedia.length - 1));
    preloadedCarouselMedia.clear();

    const modal = document.getElementById('carouselModal');
    if (!modal || currentRestaurantMedia.length === 0) {
        return;
    }

    modal.classList.add('active');
    document.body.classList.add('carousel-open');
    setupCarouselDots();
    updateCarousel();
}

function closeCarousel() {
    const modal = document.getElementById('carouselModal');
    const video = document.getElementById('carouselVideo');

    if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
    }

    if (modal) {
        modal.classList.remove('active');
    }

    document.body.classList.remove('carousel-open');
}

function changeSlide(direction) {
    if (!currentRestaurantMedia.length) {
        return;
    }

    currentSlideIndex += direction;
    if (currentSlideIndex < 0) currentSlideIndex = currentRestaurantMedia.length - 1;
    if (currentSlideIndex >= currentRestaurantMedia.length) currentSlideIndex = 0;
    updateCarousel();
}

function goToSlide(index) {
    if (!currentRestaurantMedia.length) {
        return;
    }

    currentSlideIndex = index;
    updateCarousel();
}

function updateCarousel() {
    if (currentRestaurantMedia.length === 0) {
        return;
    }

    const mediaPath = currentRestaurantMedia[currentSlideIndex];
    const img = document.getElementById('carouselImage');
    const video = document.getElementById('carouselVideo');
    const caption = document.getElementById('carouselCaption');

    if (!img || !video || !caption) {
        return;
    }

    if (isVideoMedia(mediaPath)) {
        img.style.display = 'none';
        video.style.display = 'block';
        video.src = mediaPath;
        video.load();
    } else {
        video.pause();
        video.removeAttribute('src');
        video.load();
        video.style.display = 'none';
        img.style.display = 'block';
        img.classList.remove('is-ready');
        img.addEventListener('load', () => {
            img.classList.add('is-ready');
        }, { once: true });
        img.src = mediaPath;
        img.alt = `${currentRestaurantName} picture ${currentSlideIndex + 1}`;

        if (img.complete) {
            img.classList.add('is-ready');
        }
    }

    caption.textContent = `${currentRestaurantName} · ${currentSlideIndex + 1} / ${currentRestaurantMedia.length}`;
    updateDots();
    preloadAdjacentCarouselMedia();
}

function setupCarouselDots() {
    const dotsContainer = document.getElementById('carouselDots');
    if (!dotsContainer) {
        return;
    }

    dotsContainer.innerHTML = '';

    currentRestaurantMedia.forEach((_, index) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'carousel-dot';
        dot.setAttribute('aria-label', `Go to picture ${index + 1}`);
        dot.addEventListener('click', () => goToSlide(index));
        dotsContainer.appendChild(dot);
    });

    updateDots();
}

function updateDots() {
    document.querySelectorAll('.carousel-dot').forEach((dot, index) => {
        dot.classList.toggle('active', index === currentSlideIndex);
    });
}

function preloadAdjacentCarouselMedia() {
    const total = currentRestaurantMedia.length;
    if (total < 2) {
        return;
    }

    preloadCarouselMedia((currentSlideIndex + 1) % total);
    preloadCarouselMedia((currentSlideIndex - 1 + total) % total);
}

function preloadCarouselMedia(index) {
    const mediaPath = currentRestaurantMedia[index];
    if (!mediaPath || isVideoMedia(mediaPath) || preloadedCarouselMedia.has(mediaPath)) {
        return;
    }

    const image = new Image();
    image.decoding = 'async';
    image.src = mediaPath;
    preloadedCarouselMedia.add(mediaPath);
}

function isVideoMedia(path) {
    return /\.((mp4)|(mov)|(webm))$/i.test(String(path || ''));
}

function setupEventListeners() {
    document.querySelectorAll('.view-btn').forEach((button) => {
        button.addEventListener('click', () => {
            const view = button.dataset.view || '';
            currentView = view || 'selected';
            currentCategoryFilters = new Set([currentView]);
            renderCityFilter();
            renderRestaurants();
        });
    });

    const clearCityFilter = document.getElementById('clearCityFilter');
    if (clearCityFilter) {
        clearCityFilter.addEventListener('click', () => {
            currentCityFilters.clear();
            renderCityFilter();
            renderRestaurants();
        });
    }

    const grid = document.getElementById('restaurantGrid');
    if (grid && !gridInteractionsBound) {
        gridInteractionsBound = true;
        grid.addEventListener('click', (event) => {
            const carouselTrigger = event.target.closest('[data-open-carousel]');
            if (carouselTrigger && grid.contains(carouselTrigger)) {
                const restaurant = restaurantIndex.get(carouselTrigger.dataset.restaurantId || '');
                if (!restaurant) {
                    return;
                }

                const startIndex = Number(carouselTrigger.dataset.startIndex || '0');
                openCarouselForRestaurant(restaurant, startIndex);
                return;
            }

            const notesTrigger = event.target.closest('[data-toggle-notes]');
            if (notesTrigger && grid.contains(notesTrigger)) {
                const card = notesTrigger.closest('.restaurant-card');
                const panel = card ? card.querySelector('.compact-note-panel') : null;

                if (!panel) {
                    return;
                }

                const nextState = panel.hidden;
                panel.hidden = !nextState;
                notesTrigger.classList.toggle('active', nextState);
                notesTrigger.setAttribute('aria-expanded', String(nextState));
            }
        });
    }

    const adminToggle = document.getElementById('adminToggle');
    if (adminToggle) {
        adminToggle.addEventListener('click', () => {
            const panel = document.getElementById('adminPanel');
            panel.hidden = !panel.hidden;
        });
    }

    const closeAdmin = document.getElementById('closeAdmin');
    if (closeAdmin) {
        closeAdmin.addEventListener('click', () => {
            document.getElementById('adminPanel').hidden = true;
            resetForm();
        });
    }

    const restaurantForm = document.getElementById('restaurantForm');
    if (restaurantForm) {
        restaurantForm.addEventListener('submit', handleFormSubmit);
    }

    const resetFormBtn = document.getElementById('resetForm');
    if (resetFormBtn) {
        resetFormBtn.addEventListener('click', resetForm);
    }

    const exportDataBtn = document.getElementById('exportData');
    if (exportDataBtn) {
        exportDataBtn.addEventListener('click', exportData);
    }

    const importDataInput = document.getElementById('importData');
    if (importDataInput) {
        importDataInput.addEventListener('change', importData);
    }

    const resetDataBtn = document.getElementById('resetData');
    if (resetDataBtn) {
        resetDataBtn.addEventListener('click', resetData);
    }

    document.addEventListener('keydown', (event) => {
        const cityDropdown = document.getElementById('cityFilterDropdown');
        if (cityDropdown && cityDropdown.open && event.key === 'Escape') {
            cityDropdown.open = false;
        }

        const modal = document.getElementById('carouselModal');
        if (modal && modal.classList.contains('active')) {
            if (event.key === 'ArrowLeft') changeSlide(-1);
            if (event.key === 'ArrowRight') changeSlide(1);
            if (event.key === 'Escape') closeCarousel();
        }
    });

    document.addEventListener('click', (event) => {
        const cityDropdown = document.getElementById('cityFilterDropdown');
        if (cityDropdown && cityDropdown.open && !cityDropdown.contains(event.target)) {
            cityDropdown.open = false;
        }
    });

    document.addEventListener('focusin', (event) => {
        const cityDropdown = document.getElementById('cityFilterDropdown');
        if (cityDropdown && cityDropdown.open && !cityDropdown.contains(event.target)) {
            cityDropdown.open = false;
        }
    });
}

// =========================================
// Admin Panel / CMS Functions
// =========================================
function setupAdminPanel() {
    renderAdminList();
}

function refreshRestaurantViews() {
    rebuildRestaurantStore();
    renderCityFilter();
    renderRestaurants();
    renderAdminList();
}

function renderAdminList() {
    const list = document.getElementById('adminList');
    list.innerHTML = '';


    // Combine all lists for admin view
    const allRestaurants = [...selectedPlaces, ...honorableMentions, ...casualPlaces, ...hiddenRestaurants, ...dayToDayPlaces];

    allRestaurants.forEach((r, index) => {
        const item = document.createElement('div');
        item.className = 'admin-list-item';
        // Escape single quotes for onclick
        const safeName = r.name.replace(/'/g, "\\'");

        // Determine category badge
        let categoryBadge = '';
        if (selectedPlaces.find(p => p.name === r.name)) categoryBadge = '⭐';
        else if (honorableMentions.find(p => p.name === r.name)) categoryBadge = '🏅';
        else if (casualPlaces.find(p => p.name === r.name)) categoryBadge = '🌿';
        else if (hiddenRestaurants.find(p => p.name === r.name)) categoryBadge = '🔒';

        item.innerHTML = `
            <span>${categoryBadge} <strong>${r.name}</strong> - ${r.cuisine} - ${r.price}</span>
            <div style="display: flex; gap: 0.5rem;">
                <button class="ghost-btn" onclick="editRestaurant('${safeName}')">Edit</button>
                <button class="ghost-btn danger" onclick="deleteRestaurant(${index})">Delete</button>
            </div>
        `;
        list.appendChild(item);
    });
}

function editRestaurant(name) {
    const restaurant = selectedPlaces.find(r => r.name === name) ||
        honorableMentions.find(r => r.name === name) ||
        casualPlaces.find(r => r.name === name) ||
        hiddenRestaurants.find(r => r.name === name) ||
        dayToDayPlaces.find(r => r.name === name);
    if (!restaurant) return;

    editingRestaurantName = name;

    document.getElementById('nameInput').value = restaurant.name;
    document.getElementById('cuisineInput').value = restaurant.cuisine;
    document.getElementById('priceInput').value = restaurant.price;
    document.getElementById('ratingInput').value = restaurant.rating;
    document.getElementById('locationInput').value = restaurant.location;
    document.getElementById('mapInput').value = restaurant.map || '';
    document.getElementById('photoInput').value = restaurant.photo || '';
    document.getElementById('descriptionInput').value = restaurant.description;
    document.getElementById('notesInput').value = restaurant.notes || '';

    // Set category
    let category = 'selected';
    if (honorableMentions.find(r => r.name === name)) category = 'honorable';
    else if (casualPlaces.find(r => r.name === name)) category = 'casual';
    else if (hiddenRestaurants.find(r => r.name === name)) category = 'hidden';
    document.getElementById('categoryInput').value = category;

    // Show image selector if available
    const mediaKey = getRestaurantMediaKey(restaurant);
    const media = mediaIndex[mediaKey];

    const selector = document.getElementById('imageSelector');
    const grid = document.getElementById('selectorGrid');

    if (media && media.length > 0) {
        selector.style.display = 'block';
        grid.innerHTML = '';

        // Initialize hiddenImages if it doesn't exist
        if (!restaurant.hiddenImages) {
            restaurant.hiddenImages = [];
        }

        media.forEach(path => {
            const container = document.createElement('div');
            container.style.cssText = 'position: relative; display: inline-block; margin: 5px;';

            const img = document.createElement('img');
            img.src = path;
            img.className = 'selector-thumbnail';
            if (path === restaurant.photo) {
                img.classList.add('selected');
            }
            img.onclick = () => {
                document.querySelectorAll('.selector-thumbnail').forEach(t => t.classList.remove('selected'));
                img.classList.add('selected');
                document.getElementById('photoInput').value = path;
            };

            // Add checkbox for carousel visibility
            const checkboxContainer = document.createElement('div');
            checkboxContainer.style.cssText = 'position: absolute; top: 5px; left: 5px; background: rgba(255,255,255,0.9); padding: 2px 5px; border-radius: 3px; font-size: 11px;';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = !restaurant.hiddenImages.includes(path);
            checkbox.title = 'Show in carousel';
            checkbox.style.cssText = 'margin-right: 3px;';
            checkbox.onclick = (e) => {
                e.stopPropagation();
                if (checkbox.checked) {
                    // Remove from hidden
                    restaurant.hiddenImages = restaurant.hiddenImages.filter(p => p !== path);
                } else {
                    // Add to hidden
                    if (!restaurant.hiddenImages.includes(path)) {
                        restaurant.hiddenImages.push(path);
                    }
                }
                saveRestaurants();
                refreshRestaurantViews();
            };

            const label = document.createElement('span');
            label.textContent = '📸';
            label.style.cursor = 'pointer';
            label.onclick = (e) => {
                e.stopPropagation();
                checkbox.checked = !checkbox.checked;
                checkbox.onclick(e);
            };

            checkboxContainer.appendChild(checkbox);
            checkboxContainer.appendChild(label);

            container.appendChild(img);
            container.appendChild(checkboxContainer);
            grid.appendChild(container);
        });
    } else {
        selector.style.display = 'none';
    }

    document.getElementById('adminPanel').hidden = false;
}

function deleteRestaurant(index) {
    if (confirm('Are you sure you want to delete this restaurant?')) {
        const allRestaurants = [...selectedPlaces, ...honorableMentions, ...casualPlaces, ...hiddenRestaurants, ...dayToDayPlaces];
        const restaurant = allRestaurants[index];

        // Find and remove from the correct array
        const selectedIndex = selectedPlaces.findIndex(r => r.name === restaurant.name);
        if (selectedIndex !== -1) {
            selectedPlaces.splice(selectedIndex, 1);
        } else {
            const honorableIndex = honorableMentions.findIndex(r => r.name === restaurant.name);
            if (honorableIndex !== -1) {
                honorableMentions.splice(honorableIndex, 1);
            } else {
                const casualIndex = casualPlaces.findIndex(r => r.name === restaurant.name);
                if (casualIndex !== -1) {
                    casualPlaces.splice(casualIndex, 1);
                } else {
                    const hiddenIndex = hiddenRestaurants.findIndex(r => r.name === restaurant.name);
                    if (hiddenIndex !== -1) {
                        hiddenRestaurants.splice(hiddenIndex, 1);
                    } else {
                        const dayToDayIndex = dayToDayPlaces.findIndex(r => r.name === restaurant.name);
                        if (dayToDayIndex !== -1) {
                            dayToDayPlaces.splice(dayToDayIndex, 1);
                        }
                    }
                }
            }
        }

        saveRestaurants();
        refreshRestaurantViews();
    }
}

function handleFormSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('nameInput').value;
    const cuisine = document.getElementById('cuisineInput').value;
    const price = document.getElementById('priceInput').value;
    const rating = parseFloat(document.getElementById('ratingInput').value);
    const location = document.getElementById('locationInput').value;
    const map = document.getElementById('mapInput').value;
    const photo = document.getElementById('photoInput').value;
    const description = document.getElementById('descriptionInput').value;
    const notes = document.getElementById('notesInput').value;
    const category = document.getElementById('categoryInput').value;

    if (editingRestaurantName) {
        // Edit existing - find in all arrays
        const restaurant = selectedPlaces.find(r => r.name === editingRestaurantName) ||
            honorableMentions.find(r => r.name === editingRestaurantName) ||
            casualPlaces.find(r => r.name === editingRestaurantName) ||
            hiddenRestaurants.find(r => r.name === editingRestaurantName) ||
            dayToDayPlaces.find(r => r.name === editingRestaurantName);

        if (restaurant) {
            // Update restaurant data
            restaurant.name = name;
            restaurant.cuisine = cuisine;
            restaurant.price = price;
            restaurant.rating = rating;
            restaurant.location = location;
            restaurant.map = map;
            restaurant.photo = photo;
            restaurant.description = description;
            restaurant.notes = notes;

            // Handle category change - remove from old array and add to new
            const oldCategory = selectedPlaces.find(r => r.name === editingRestaurantName) ? 'selected' :
                honorableMentions.find(r => r.name === editingRestaurantName) ? 'honorable' :
                    casualPlaces.find(r => r.name === editingRestaurantName) ? 'casual' :
                    hiddenRestaurants.find(r => r.name === editingRestaurantName) ? 'hidden' : 'everyday';

            if (oldCategory !== category) {
                // Remove from old array
                if (oldCategory === 'selected') {
                    const idx = selectedPlaces.findIndex(r => r.name === editingRestaurantName);
                    if (idx !== -1) selectedPlaces.splice(idx, 1);
                } else if (oldCategory === 'honorable') {
                    const idx = honorableMentions.findIndex(r => r.name === editingRestaurantName);
                    if (idx !== -1) honorableMentions.splice(idx, 1);
                } else if (oldCategory === 'casual') {
                    const idx = casualPlaces.findIndex(r => r.name === editingRestaurantName);
                    if (idx !== -1) casualPlaces.splice(idx, 1);
                } else if (oldCategory === 'hidden') {
                    const idx = hiddenRestaurants.findIndex(r => r.name === editingRestaurantName);
                    if (idx !== -1) hiddenRestaurants.splice(idx, 1);
                } else {
                    const idx = dayToDayPlaces.findIndex(r => r.name === editingRestaurantName);
                    if (idx !== -1) dayToDayPlaces.splice(idx, 1);
                }

                // Add to new array
                if (category === 'selected') {
                    selectedPlaces.push(restaurant);
                } else if (category === 'honorable') {
                    honorableMentions.push(restaurant);
                } else if (category === 'casual') {
                    casualPlaces.push(restaurant);
                } else if (category === 'hidden') {
                    hiddenRestaurants.push(restaurant);
                }
            }
        }
    } else {
        // Add new restaurant to the selected category
        const newRestaurant = {
            name,
            cuisine,
            price,
            rating,
            description,
            location,
            notes,
            photo,
            map,
            lat: 0,
            lng: 0
        };

        if (category === 'selected') {
            selectedPlaces.push(newRestaurant);
        } else if (category === 'honorable') {
            honorableMentions.push(newRestaurant);
        } else if (category === 'casual') {
            casualPlaces.push(newRestaurant);
        } else if (category === 'hidden') {
            hiddenRestaurants.push(newRestaurant);
        } else {
            dayToDayPlaces.push(newRestaurant);
        }
    }

    saveRestaurants();
    refreshRestaurantViews();
    resetForm();
    document.getElementById('adminPanel').hidden = true;
}

function resetForm() {
    document.getElementById('restaurantForm').reset();
    document.getElementById('imageSelector').style.display = 'none';
    editingRestaurantName = null;
}

function exportData() {
    const data = {
        selectedPlaces,
        honorableMentions,
        casualPlaces,
        hiddenRestaurants,
        dayToDayPlaces
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'restaurants_export.json';
    a.click();
}

function importData(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const imported = JSON.parse(event.target.result);
            if (Array.isArray(imported.selectedPlaces) && Array.isArray(imported.honorableMentions)) {
                selectedPlaces = imported.selectedPlaces;
                honorableMentions = imported.honorableMentions;
                casualPlaces = Array.isArray(imported.casualPlaces) ? imported.casualPlaces : casualPlaces;
                hiddenRestaurants = Array.isArray(imported.hiddenRestaurants) ? imported.hiddenRestaurants : [];
                dayToDayPlaces = Array.isArray(imported.dayToDayPlaces) ? imported.dayToDayPlaces : [];
                saveRestaurants();
                refreshRestaurantViews();
                alert('Data imported successfully!');
            } else {
                alert('Invalid import format. Expected at least {selectedPlaces: [], honorableMentions: []}');
            }
        } catch (err) {
            alert('Error importing data: ' + err.message);
        }
    };
    reader.readAsText(file);
}

function resetData() {
    if (confirm('This will reset all data to default. Are you sure?')) {
        localStorage.removeItem(LOCAL_STORAGE_KEYS.selected);
        localStorage.removeItem(LOCAL_STORAGE_KEYS.honorable);
        localStorage.removeItem(LOCAL_STORAGE_KEYS.casual);
        localStorage.removeItem(LOCAL_STORAGE_KEYS.dayToDay);
        localStorage.removeItem(LOCAL_STORAGE_KEYS.hidden);
        localStorage.removeItem(LOCAL_STORAGE_KEYS.source);
        clearLegacyRestaurantSessionCache();
        // Reload from JSON files
        location.reload();
    }
}

// =========================================
// Storage Functions
// =========================================
function saveRestaurants() {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEYS.selected, JSON.stringify(selectedPlaces));
        localStorage.setItem(LOCAL_STORAGE_KEYS.honorable, JSON.stringify(honorableMentions));
        localStorage.setItem(LOCAL_STORAGE_KEYS.casual, JSON.stringify(casualPlaces));
        localStorage.setItem(LOCAL_STORAGE_KEYS.dayToDay, JSON.stringify(dayToDayPlaces));
        localStorage.setItem(LOCAL_STORAGE_KEYS.hidden, JSON.stringify(hiddenRestaurants));
        setRestaurantDataSource('local');
    } catch (error) {
        console.warn('Unable to save restaurants', error);
    }
}
