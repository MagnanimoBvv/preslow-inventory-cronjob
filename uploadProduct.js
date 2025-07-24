const axios = require('axios');
require('dotenv').config();

const surfaces = {
    'POLIESTER FINO': 'TEXTIL',
    'NYLON LIGHT': 'TEXTIL',
    'MICROFIBRA PARIS': 'TEXTIL',
    'NEOPRENO': 'TEXTIL',
    'ALGODON PIQUE': 'TEXTIL',
    'ALGODON': 'TEXTIL',
};

const categories = {
    'CHAMARRA': 'textil,chamarras y chalecos',
    'CHALECO': 'textil,chamarras y chalecos',
    'POLO BASICA': 'textil,playeras',
    'CAMISA': 'textil,playeras',
};

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

function processProductData(product) {
    const productTitle = `${product.linea} ${product.departamento} ${product.nombre} ${product.modelo}`;
    return {
        handle: productTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        title: productTitle,
        descriptionHtml: product.descripcion,
        vendor: 'Preslow',
        tags: `preslow,${categories[product.linea]}`,
        metafields: [
            {
                key: 'superficie',
                namespace: 'custom',
                type: 'single_line_text_field',
                value: surfaces[product.tela]
            }
        ],
        productOptions: [
            {
                name: 'Color',
                values: [{
                    name: 'Default',
                }],
            },
            {
                name: 'Talla',
                values: [{
                    name: 'Default',
                }],
            }
        ]
    };
}

function getProductMedia(modelProducts) {
    const seenImages = new Set();
    const seenColors = new Set();

    return modelProducts
        .flatMap(p => p.imagenes.map(img => ({ src: img, color: p.color })))
        .filter(img => {
            if (seenImages.has(img.src)) return false;
            seenImages.add(img.src);
            return true;
        })
        .map(img => {
            if (!seenColors.has(img.color)) {
                seenColors.add(img.color);
                return {
                    mediaContentType: 'IMAGE',
                    originalSource: img.src,
                    alt: img.color
                };
            }
            return {
                mediaContentType: 'IMAGE',
                originalSource: img.src,
            };
        });
}

function createVariants(modelo, products, locationId, mediaNodes) {
    return products
        .filter(p => p.modelo === modelo)
        .map(product => {
            const matchingMedia = mediaNodes.find(media => media.alt === product.color);

            return {
                inventoryItem: {
                    sku: product.modelo_ct,
                    tracked: true
                },
                inventoryQuantities: [{
                    availableQuantity: product.disponible,
                    locationId
                }],
                optionValues: [
                    { optionName: 'Color', name: colors[product.color] },
                    { optionName: 'Talla', name: product.talla }
                ],
                price: product.precio_distribuidor / 0.67,
                mediaId: matchingMedia ? matchingMedia.id : mediaNodes[0].id
            };
        });
}

async function uploadProduct(input, media) {
    const response = await axios.post(
        process.env.GRAPHQL_URL,
        JSON.stringify({
            query: `
                mutation productCreate($input: ProductInput!, $media: [CreateMediaInput!]) {
                    productCreate(input: $input, media: $media) {
                        product {
                            id
                            media(first: 250) {
                                nodes {
                                    id
                                    alt
                                }
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
                media,
            }
        }), {
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': process.env.SHOPIFY_TOKEN,
            }
        }
    );

    return {
        product: response.data.data.productCreate.product,
        mediaNodes: response.data.data.productCreate.product.media.nodes
    };
}

async function uploadVariants(productId, variants) {
    const response = await axios.post(
        process.env.GRAPHQL_URL,
        JSON.stringify({
            query: `
                mutation ProductVariantsCreate($productId: ID!, $strategy: ProductVariantsBulkCreateStrategy, $variants: [ProductVariantsBulkInput!]!) {
                    productVariantsBulkCreate(productId: $productId, strategy: $strategy, variants: $variants) {
                        productVariants {
                            id
                            title
                        }
                        userErrors {
                            message
                            field
                        }
                    }
                }
            `,
            variables: {
                productId,
                strategy: 'REMOVE_STANDALONE_VARIANT', //Usa este argumento para eliminar variante por defecto
                variants,
            }
        }), {
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': process.env.SHOPIFY_TOKEN,
            }
        }
    );
    // console.log(response.data.data.productVariantsBulkCreate.userErrors);

    return response.data.data.productVariantsBulkCreate.productVariants;
}

async function publishProduct(id, input) {
    const response = await axios.post(
        process.env.GRAPHQL_URL,
        JSON.stringify({
            query: `
                mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
                    publishablePublish(id: $id, input: $input) {
                        publishable {
                            availablePublicationsCount {
                                count
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
                id,
                input,
            }
        }), {
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': process.env.SHOPIFY_TOKEN,
            }
        }
    );

    return response.data.data.publishablePublish.publishable;
}

async function uploadPreslowProduct(modelProducts, locationId, publications) {
    try {
        const productInput = processProductData(modelProducts[0]);
        const media = getProductMedia(modelProducts);

        const { product: productResponse, mediaNodes } = await uploadProduct(productInput, media);

        const variants = createVariants(modelProducts[0].modelo, modelProducts, locationId, mediaNodes);
        await uploadVariants(productResponse.id, variants);

        await publishProduct(productResponse.id, publications);

        console.log(`✅ Modelo ${modelProducts[0].modelo} subido con ${variants.length} variantes`);
    } catch (error) {
        console.error('❌ Error al subir productos:', error);
    }
}

module.exports = { uploadPreslowProduct };