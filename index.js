require('dotenv').config();
const axios = require('axios');
const { getLocationId, paginateProductsByVendor, updateInventory } = require('./shopifyFunctions');

async function getPreslowProducts() {
    const response = await axios.get(
        'https://cliente.preslow.app/v1/catalogo',
        {
            headers: {
                'x-api-key': process.env.PW_KEY
            }
        }
    );
    return response.data;
}

function getStores() {
    const storeNames = process.env.STORES.split(',');

    return storeNames.map(name => ({
        name,
        graphqlUrl: process.env[`GRAPHQL_URL_${name}`],
        shopifyToken: process.env[`SHOPIFY_TOKEN_${name}`],
    }));
}

async function updateProducts(store, products) {
    const locationId = await getLocationId(store);
    const shopifyProducts = await paginateProductsByVendor(store, 'Preslow');
    const uniqueModels = [...new Set(products.map(p => p.modelo))];
    for (const model of uniqueModels) {
        // if (model !== 'PRF71484') continue; // If para pruebas con un producto específico
        const activeVariants = products.filter(p => p.modelo === model);
        const product = activeVariants[0];
        try {
            const handle = `pw-${product.modelo}`.trim().toLowerCase();
            const shopifyProduct = shopifyProducts.find(p => p.handle === handle);
            if (!shopifyProduct) continue;

            const shopifyVariants = shopifyProduct.variants.nodes;
            const activeVariantBySKU = new Map(activeVariants.map(v => [v.modelo_ct, v]));

            for (const variant of shopifyVariants) {
                const activeVariant = activeVariantBySKU.get(variant.sku);
                const targetInventory = activeVariant ? activeVariant.disponible : 0;
                const label = activeVariant ? 'Variante existente' : 'Variante faltante';
                console.log(`[${store.name}] ${label}: ${shopifyProduct.title} ${variant.title}, Prev ${variant.inventoryQuantity} Now ${targetInventory}`);

                if (variant.inventoryQuantity === targetInventory) continue;

                const variantToUpdate = {
                    quantities: {
                        changeFromQuantity: null,
                        inventoryItemId: variant.inventoryItem.id,
                        locationId,
                        quantity: targetInventory,
                    },
                    name: "available",
                    reason: "correction",
                };
                const response = await updateInventory(store, variantToUpdate);
                console.log(`[${store.name}] Inventario actualizado:`, response.changes);
            }
            // break;
        } catch (error) {
            console.error(`[${store.name}] Error actualizando ${product.linea} ${product.departamento} ${product.nombre} ${product.modelo}:`, error);
        }
    }
}

async function main() {
    const products = await getPreslowProducts();

    const stores = getStores();
    for (const store of stores) {
        await updateProducts(store, products);
    }
}

main();
