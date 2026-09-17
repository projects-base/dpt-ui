/**
 * The system-design topic picker and its reference content.
 *
 * Static study material plus the click that reveals it; no server involved.
 */
import { el } from '../core/dom.js';
import { network } from '../features/knowledge/map.js';

export const sysDesignData = {
  'load-balancing': {
    title: 'Load Balancing',
    tags: ['Architecture', 'Scalability'],
    body: `<p>Load balancing is the process of distributing network traffic across multiple servers. This ensures no single server bears too much demand. By spreading the work evenly, load balancing improves application responsiveness.</p>
    <h4>Common Algorithms</h4>
    <ul>
      <li><strong>Round Robin:</strong> Requests are distributed across the group of servers sequentially.</li>
      <li><strong>Least Connections:</strong> Sends requests to the server with the fewest current connections.</li>
      <li><strong>IP Hash:</strong> Determines which server receives the request based on the client's IP.</li>
    </ul>`
  },
  'caching': {
    title: 'Caching Strategies',
    tags: ['Performance', 'Data'],
    body: `<p>Caching involves storing copies of frequently accessed data in a fast temporary storage (like RAM) to reduce latency and database load.</p>
    <h4>Common Patterns</h4>
    <ul>
      <li><strong>Cache-Aside:</strong> Application checks cache first; if miss, fetches from DB and populates cache.</li>
      <li><strong>Write-Through:</strong> Data is written into the cache and the backing store at the same time.</li>
      <li><strong>Tools:</strong> Redis, Memcached, CDNs.</li>
    </ul>`
  },
  'databases': {
    title: 'Databases (SQL vs NoSQL)',
    tags: ['Storage', 'ACID'],
    body: `<p>Choosing the right database depends on the data structure, read/write ratio, and scale.</p>
    <h4>Key Concepts</h4>
    <ul>
      <li><strong>SQL:</strong> Relational, ACID compliant, vertical scaling (typically), strict schema (PostgreSQL, MySQL).</li>
      <li><strong>NoSQL:</strong> Non-relational, BASE compliant, horizontal scaling, flexible schema (MongoDB, Cassandra).</li>
      <li><strong>Sharding:</strong> Distributing data across multiple databases to scale horizontally.</li>
    </ul>`
  },
  'messaging': {
    title: 'Message Queues',
    tags: ['Asynchronous', 'Decoupling'],
    body: `<p>Message queues facilitate asynchronous communication between microservices, allowing them to scale independently and loosely couple.</p>
    <h4>Tools & Patterns</h4>
    <ul>
      <li><strong>Kafka:</strong> High-throughput distributed commit log (event streaming).</li>
      <li><strong>RabbitMQ:</strong> Advanced routing and traditional message brokering.</li>
      <li><strong>Fan-out:</strong> A single message is delivered to multiple consuming services.</li>
    </ul>`
  },
  'cdn': {
    title: 'CDN & Edge Computing',
    tags: ['Performance', 'Network'],
    body: `<p>A Content Delivery Network (CDN) is a geographically distributed network of servers that caches content close to end-users, reducing latency dramatically.</p>
    <h4>Key Concepts</h4>
    <ul>
      <li><strong>PoP (Point of Presence):</strong> Edge locations where CDN servers are deployed globally.</li>
      <li><strong>Cache-Control Headers:</strong> Tell CDN how long to cache an object (TTL).</li>
      <li><strong>Cache Invalidation:</strong> Purging stale content (one of the hardest problems).</li>
      <li><strong>Tools:</strong> AWS CloudFront, Cloudflare, Akamai, Fastly.</li>
    </ul>`
  },
  'api-gateway': {
    title: 'API Gateway',
    tags: ['Architecture', 'Security'],
    body: `<p>An API Gateway is a server that acts as an entry point for clients into a microservices architecture. It handles cross-cutting concerns in one place.</p>
    <h4>Responsibilities</h4>
    <ul>
      <li><strong>Rate Limiting:</strong> Protect backend services from being overwhelmed.</li>
      <li><strong>Authentication:</strong> Validate JWT/OAuth tokens before forwarding requests.</li>
      <li><strong>Routing:</strong> Route requests to the correct downstream microservice.</li>
      <li><strong>Tools:</strong> AWS API Gateway, Kong, NGINX, Traefik.</li>
    </ul>`
  }
};

export function selectSysTopic(topicId) {
  // Update active card
  document.querySelectorAll('.sys-topic-card').forEach(card => card.classList.remove('active'));
  const activeCard = Array.from(document.querySelectorAll('.sys-topic-card')).find(c => c.getAttribute('onclick').includes(topicId));
  if (activeCard) activeCard.classList.add('active');

  const data = sysDesignData[topicId];
  if (data) {
    el('sysReaderTitle').textContent = data.title;
    el('sysReaderBody').innerHTML = data.body;
    
    const tagsWrapper = document.querySelector('.sys-tags');
    tagsWrapper.innerHTML = data.tags.map(t => `<span class="sys-badge">${t}</span>`).join('');
  }
}

// ── Knowledge Web ──────────────────────────────────────────────────
//
// The map is stored server-side (/api/knowledge), so it follows the user
// between browsers and devices. It previously lived only in localStorage —
// tied to one browser profile, and one cache-clear away from being lost.
// Any map still sitting in localStorage is migrated up on first load.
