const mongoose = require('mongoose');
const Store = mongoose.model('Store');
const User = mongoose.model("User");
const multer = require('multer');
const jimp = require('jimp');
const uuid = require('uuid');

const multerOptions = {
    storage: multer.memoryStorage(),
    fileFilter(req, file, next) { //ES6 function
        const isPhoto = file.mimetype.startsWith('image/');
        if(isPhoto) {
            next(null, true);
        } else {
            next({message: 'That filetype isn\'t allowed!'}, false);
        }
    }
} 

exports.homePage = (req, res) => {
    console.log(req.name);
    res.render('index');
}

exports.addStore = (req, res) => {
    res.render('editStore', {title: 'Add Store'});
}

exports.upload = multer(multerOptions).single('photo');

exports.resize = async (req, res, next) => {
    // Check if there is no new file to resize
    if (!req.file) {
        next(); // Skip to next middleware
        return;
    }
    const extension = req.file.mimetype.split('/')[1];
    req.body.photo = `${uuid.v4()}.${extension}`; // Saves file to use for next requests
    const photo = await jimp.read(req.file.buffer); // Save file to const, when buffer is ready
    await photo.resize(800, jimp.AUTO); // Resize element
    await photo.write(`./public/uploads/${req.body.photo}`);
    // Once we have written the photo to our system, keep going!
    next();
}

exports.createStore = async (req, res) => {
    req.body.author = req.user._id;
    const store = await (new Store(req.body)).save();
    req.flash('success', `Successfully created ${store.name}. Care to leave a review?`);
    res.redirect(`/store/${store.slug}`);
}

exports.getStores = async (req, res) => {
    // 1. Query database for a list of all stores
    const stores = await Store.find(); // Returns a promise
    res.render('stores', {title: 'Stores', stores});
}

exports.getStoreBySlug = async (req, res) => {
    const store = await Store.findOne({slug: req.params.slug}).populate('author');
    if (!store) return next();
    res.render('store', {store, title: store.name});
}

exports.getStoreByTag = async (req, res) => {
    const tag = req.params.tag;
    const tagQuery = tag || { $exists: true }; // Just give me any store where a 'tag' property exists
    const tagsPromise = await Store.getTagsList();
    const storesPromise = Store.find({ tags: tagQuery });
    const [tags, stores] = await Promise.all([tagsPromise, storesPromise]);

    res.render('tag', {tags, title: 'Tags', tag, stores});
}

const confirmOwner = (store, user) => {
    if (!store.author.equals(user._id)) {
        throw Error('You must own the store in order to edit it!');
    }
}

exports.editStore = async (req, res) => {
    // 1. find the store given the id
    const store = await Store.findOne({ _id: req.params.id});
    // 2. confirm they are the owner of the store
    confirmOwner(store, req.user);
    // 3. Render out the edit form
    res.render('editStore', {title: `Edit ${store.name}`, store});
}

exports.updateStore = async (req, res) => {
    // Set the location data to be a point
    req.body.location.type = 'Point';
    // Find and update store
    const store = await Store.findOneAndUpdate({ _id: req.params.id }, req.body, {
        new: true, // Return new store instead of the old one
        runValidators: true, // Force model to run required validators
    }).exec(); // Forces query to run
    // Tell them it worked (flash)
    req.flash("success", `Sucessfully updated <strong>${store.name}</strong>. <a href="/stores/${store.slug}">View Store -></a>`);
    // Redirect to store
    res.redirect(`/stores/${store.id}/edit`);
}

exports.searchStores = async (req, res) => {
    const stores = await Store
    // First find stores that match
    .find({
        $text: {
            $search: req.query.q
        }
    }, {
        score: { $meta: 'textScore' }
    })
    // Then sort them
    .sort({
        score: {$meta: 'textScore' }
    })
    // Limit to only 5 results
    .limit(5);
    res.json(stores);
}

exports.mapStores = async (req, res) => {
    const coordinates = [req.query.lng, req.query.lat].map(parseFloat);
    const q = {
        location: {
            $near: {
                $geometry: {
                    type: 'Point',
                    coordinates
                },
                $maxDistance: 10000 // 10km
            }
        }
    };

    const stores = await Store.find(q).select('slug name description location photo').limit(10);
    res.json(stores);
}

exports.mapPage = (req, res) => {
    res.render('map', { title: 'Map' });
}

exports.heartStore = async (req, res) => {
    const hearts = req.user.hearts.map(obj => obj.toString());
    const operator = hearts.includes(req.params.id) ? '$pull' : '$addToSet';
    const user = await User
    .findByIdAndUpdate(req.user._id,
       { [operator]: { hearts: req.params.id }},
       { new: true }
    );
    res.json(user);
    // User.findOneAndUpdate()
}
