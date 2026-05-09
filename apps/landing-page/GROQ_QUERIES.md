# GROQ Queries - RLP Engenharia

Reference guide for querying posts and categories from your frontend.

---

## Basic Syntax

- `*` represents all documents in a dataset as an array
- `[_type == "post"]` represents a filter to only return matching documents
- `{ _id, title, slug }` represents a projection which defines the attributes to include in the response

---

## Post Queries

### Get all posts (basic)

```groq
*[_type == "post"]{ _id, title }
```

### Get all posts with all fields

```groq
*[_type == "post"]{
  _id,
  title,
  slug,
  publishedAt,
  excerpt,
  image,
  body,
  category->{
    _id,
    title,
    slug
  }
}
```

### Get all published posts (ordered by date)

```groq
*[_type == "post"] | order(publishedAt desc){
  _id,
  title,
  slug,
  publishedAt,
  excerpt,
  image,
  category->{
    title,
    slug
  }
}
```

### Get a single post by slug

```groq
*[_type == "post" && slug.current == $slug][0]{
  _id,
  title,
  slug,
  publishedAt,
  excerpt,
  image,
  body,
  category->{
    title,
    slug
  }
}
```

> **Note:** Pass `{ slug: "your-post-slug" }` as a parameter.

### Get posts by category

```groq
*[_type == "post" && category->slug.current == $categorySlug] | order(publishedAt desc){
  _id,
  title,
  slug,
  publishedAt,
  excerpt,
  image
}
```

> **Note:** Pass `{ categorySlug: "projetos" }` as a parameter.

### Get latest N posts

```groq
*[_type == "post"] | order(publishedAt desc)[0..4]{
  _id,
  title,
  slug,
  publishedAt,
  excerpt,
  image,
  category->{
    title
  }
}
```

> This returns the 5 most recent posts (0 to 4).

---

## Category Queries

### Get all categories

```groq
*[_type == "category"]{
  _id,
  title,
  slug,
  description
}
```

### Get a single category by slug

```groq
*[_type == "category" && slug.current == $slug][0]{
  _id,
  title,
  slug,
  description
}
```

### Get categories with post count

```groq
*[_type == "category"]{
  _id,
  title,
  slug,
  "postCount": count(*[_type == "post" && references(^._id)])
}
```

---

## Image Handling

When querying images, you get a reference. To build the URL, use the `@sanity/image-url` package:

```javascript
import imageUrlBuilder from '@sanity/image-url'
import { client } from './sanityClient'

const builder = imageUrlBuilder(client)

export function urlFor(source) {
  return builder.image(source)
}

// Usage
urlFor(post.image).width(800).url()
```

---

## Portable Text (Body)

The `body` field uses Portable Text. To render it in your frontend:

### React

```bash
npm install @portabletext/react
```

```jsx
import { PortableText } from '@portabletext/react'

<PortableText value={post.body} />
```

---

## Testing in Vision

Queries run in Vision use your authenticated session, so you will see private documents – which have a `.` in the `_id` key, like `drafts.` – that you will not see when queried from your frontend.

To test in Vision:
1. Open your Sanity Studio
2. Go to **Vision** tab
3. Paste any query from above
4. Click **Fetch**

---

## Frontend Client Setup

```javascript
import { createClient } from '@sanity/client'

export const client = createClient({
  projectId: 'YOUR_PROJECT_ID',
  dataset: 'production',
  useCdn: true,
  apiVersion: '2024-01-01',
})

// Example usage
const posts = await client.fetch('*[_type == "post"]{ _id, title }')
```

---

## Quick Reference

| Query | Description |
|-------|-------------|
| `*[_type == "post"]` | All posts |
| `*[_type == "post"][0]` | First post |
| `*[_type == "post"][0..9]` | First 10 posts |
| `category->{ title }` | Expand reference |
| `order(publishedAt desc)` | Sort by date descending |
| `slug.current == $slug` | Match slug parameter |
| `references(^._id)` | Find documents referencing parent |
| `count(...)` | Count matching documents |
