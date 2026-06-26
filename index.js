require('dotenv').config();
const axios = require('axios');
const { getLocationId, getProductByHandle, updateInventory } = require('./shopifyFunctions');

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

async function updateProducts() {
    const products = await getPreslowProducts();

    const locationId = await getLocationId();
    const uniqueModels = [...new Set(products.map(p => p.modelo))];
    for (const model of uniqueModels) {
        // if (model !== 'PRF71484') continue; // If para pruebas con un producto específico
        const activeVariants = products.filter(p => p.modelo === model);
        const product = activeVariants[0];
        try {
            const handle = `pw-${product.modelo}`.trim().toLowerCase();
            const shopifyProduct = await getProductByHandle(handle);
            if (!shopifyProduct) {
                continue;
            }

            const shopifyVariants = shopifyProduct.variants.nodes;
            for (const activeVariant of activeVariants) {
                const variant = shopifyVariants.find(v => v.sku === activeVariant.modelo_ct);
                const variantInventory = activeVariant.disponible;
                console.log(`Variante encontrada: ${shopifyProduct.title} ${variant.title}, Inventario: Prev ${variant.inventoryQuantity} Now ${variantInventory}`);

                if (variant.inventoryQuantity !== variantInventory) {
                    const variantToUpdate = {
                        quantities: {
                            changeFromQuantity: null,
                            inventoryItemId: variant.inventoryItem.id,
                            locationId,
                            quantity: variantInventory,
                        },
                        name: "available",
                        reason: "correction",
                    };
                    const response = await updateInventory(variantToUpdate);
                    console.log('Inventario actualizado:', response.changes);
                }
            }
            // break;
        } catch (error) {
            console.error(`Error actualizando el producto ${product.linea} ${product.departamento} ${product.nombre} ${product.modelo}:`, error);
        }
    }
}

updateProducts();