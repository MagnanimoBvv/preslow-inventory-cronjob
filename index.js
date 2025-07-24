const axios = require('axios');
require('dotenv').config();
const { getLocationId } = require('./getLocations');
const { getPublications } = require('./getPublications');
const { uploadPreslowProduct } = require('./uploadProduct');

async function getPreslowProducts() {
    const response = await axios.get(
        'https://cliente.preslow.app/v1/catalogo',
        {
            headers: {
                'x-api-key': process.env.API_KEY
            }
        }
    );
    return response.data;
}

const colors = {
    'MAR': 'MARINO',
    'NEG': 'NEGRO',
    'GRO': 'GRIS',
    'VIN': 'VINO',
    'AZA': 'AZUL ACERO',
    'ROJ': 'ROJO',
    'OLI': 'OLIVO',
    'ARE': 'ARENA',
    'CHO': 'CHOCOLATE',
    'TOP': 'TOPO',
    'BLA': 'BLANCO',
    'CIE': 'AZUL CIELO',
    'OXJ': 'OXFORD',
    'AZU': 'AZUL CIAN',
    'ROS': 'ROSA',
}

async function getProductByHandle(handle) {
    const response = await axios.post(
        process.env.GRAPHQL_URL,
        JSON.stringify({
            query: `
                query {
                    productByHandle(handle: "${handle}") {
                        title
                        variants(first: 250) {
                            nodes {
                                title
                                inventoryQuantity
                                inventoryItem {
                                    id
                                }
                            }
                        }
                    }
                }
            `,
        }), {
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': process.env.SHOPIFY_TOKEN,
            }
        }
    );

    return response.data.data.productByHandle;
}

async function updateInventory(input) {
    //Usa esta mutation porque Shopify no permite actualizar inventario por productVariantsBulkUpdate
    const response = await axios.post(
        process.env.GRAPHQL_URL,
        JSON.stringify({
            query: `
                mutation InventorySet($input: InventorySetQuantitiesInput!) {
                    inventorySetQuantities(input: $input) {
                        inventoryAdjustmentGroup {
                            changes {
                                delta
                                name
                            }
                        }
                        userErrors {
                            message
                            field
                        }
                    }
                }
            `,
            variables: {
                input,
            }
        }), {
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': process.env.SHOPIFY_TOKEN,
            }
        }
    );

    return response.data.data.inventorySetQuantities.inventoryAdjustmentGroup;
}

async function updateProducts() {
    const products = await getPreslowProducts();
    const locationId = await getLocationId();
    const publications = await getPublications();

    const uniqueModels = [...new Set(products.map(p => p.modelo))];
    for (const model of uniqueModels) {
        try {
            const modelProducts = products.filter(p => p.modelo === model);

            const firstProduct = modelProducts[0];
            const handle = `${firstProduct.linea} ${firstProduct.departamento} ${firstProduct.nombre} ${firstProduct.modelo}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const shopifyProduct = await getProductByHandle(handle);
            if (!shopifyProduct) {
                await uploadPreslowProduct(modelProducts, locationId, publications); // Intenta subir producto
                continue;
            }

            const variants = shopifyProduct.variants.nodes;
            for (const product of modelProducts) {
                const variant = variants.find(v => v.title === `${colors[product.color]} / ${product.talla}`);
                console.log(`Variante encontrada: ${shopifyProduct.title} ${variant.title}, Inventario: Prev ${variant.inventoryQuantity} Now ${product.disponible}`);
                if (variant.inventoryQuantity !== product.disponible) {
                    const variantToUpdate = {
                        quantities: {
                            inventoryItemId: variant.inventoryItem.id, //Usa id de inventario porque usar id de variante o producto no funciona
                            locationId,
                            quantity: product.disponible,
                        },
                        name: "available",
                        reason: "correction",
                        ignoreCompareQuantity: true, //Desactiva la comparación de inventario para siempre sobreescribir con la info del proveedor
                    };
                    const response = await updateInventory(variantToUpdate);
                    console.log('Inventario actualizado:', response.changes);
                }
            }
        } catch (error) {
            console.error(`Error actualizando el producto ${model}:`, error);
        }
    }
}

updateProducts();