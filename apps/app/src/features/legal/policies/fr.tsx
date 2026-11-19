import { TextLink } from "@packages/ui/components/ui/text-link";
import { TypographyH2, TypographyList, TypographyP } from "@packages/ui/components/ui/typography";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { ContactLink } from "../components/contact-link";

const GOOGLE_USER_DATA_POLICY = "https://developers.google.com/terms/api-services-user-data-policy";

export function PrivacyPolicyBody(): ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <TypographyH2>Qui traite vos données</TypographyH2>
        <TypographyP>
          L'éditeur de l'application est responsable du traitement. Pour toute question sur vos
          données ou pour exercer vos droits, écrivez à <ContactLink />.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Ce que fait l'application</TypographyH2>
        <TypographyP>
          Vous liez le compte Google Classroom de chacun de vos enfants. L'application lit, en
          lecture seule, ses cours, les annonces de ses enseignants et ses devoirs, en tire les
          échéances (évaluations, devoirs, sorties, piscine, documents à rendre) et vous prévient
          avant chacune d'elles.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Données traitées</TypographyH2>
        <TypographyList>
          <li>Votre compte : nom, adresse e-mail, photo et identifiant de votre compte Google.</li>
          <li>
            Le compte de chaque enfant lié : nom, adresse e-mail, photo et identifiant Google, et
            les jetons d'accès que Google nous remet, chiffrés en base.
          </li>
          <li>
            Google Classroom : la liste de ses cours ; le texte des annonces, lu le temps d'en
            extraire les dates puis jamais conservé en entier (nous gardons l'identifiant et le lien
            de l'annonce, et le court passage décrit ci-dessous) ; le titre, la date limite et
            l'état rendu ou non de ses devoirs.
          </li>
          <li>
            Les échéances obtenues : titre, courte description (300 caractères à l'extraction),
            catégorie et date, avec les corrections que vous y apportez.
          </li>
          <li>
            Le passage de l'annonce d'où vient la date (jamais plus de 300 caractères), avec la
            phrase qui le précède et celle qui le suit (jamais plus de 200 caractères chacune), sa
            position dans l'annonce et les raisons pour lesquelles une date est à vérifier. Les
            prénoms de vos enfants, les adresses e-mail, les numéros de téléphone et les liens y
            sont masqués avant tout stockage. Il sert seulement à vous montrer pourquoi une date est
            à vérifier, pour que vous la contrôliez dans son contexte.
          </li>
          <li>
            Ce que l'annonce vous demande de payer, signer, rendre ou apporter pour une échéance (au
            plus 8 éléments de chaque sorte), chacun avec les mots de l'annonce qui le demandent,
            masqués de la même façon ; une somme n'est retenue que si elle est écrite dans ces mots.
          </li>
          <li>
            Vos alertes : l'heure choisie pour chaque échéance, l'adresse technique d'abonnement aux
            notifications de chacun de vos appareils et le type de navigateur ; votre choix de
            recevoir le résumé du dimanche et les semaines où il vous a été envoyé.
          </li>
          <li>
            Votre lien d'agenda, si vous en créez un : une empreinte de son secret (jamais le lien
            lui-même), les enfants qu'il inclut et l'heure de sa dernière lecture. L'agenda que vous
            y abonnez (Google, Apple, Outlook) lit vos échéances par ce lien et en garde une copie
            selon ses propres règles.
          </li>
          <li>
            Vos préférences : langue, fuseau horaire, pays et choix de laisser l'IA lire les
            annonces.
          </li>
          <li>
            L'usage de l'IA par votre compte : pour chaque mois et chaque fonction, le nombre
            d'appels, d'escalades vers un modèle plus puissant et leur coût. Aucun contenu.
          </li>
          <li>
            Un journal technique de chaque appel au modèle : fonction, modèle, coût, issue et une
            empreinte de ce qui a été envoyé, jamais le contenu lui-même.
          </li>
          <li>
            Les sessions de connexion (adresse IP, navigateur) et les e-mails que nous vous
            envoyons.
          </li>
        </TypographyList>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Données de mineurs</TypographyH2>
        <TypographyP>
          Les données Classroom sont celles d'enfants mineurs. Seul un parent ou un représentant
          légal crée un compte et lie le compte de son enfant, depuis sa propre session ; l'enfant
          n'utilise pas l'application. Pour un enfant de moins de 15 ans, cette liaison relève du
          titulaire de l'autorité parentale. Nous ne faisons ni profilage, ni publicité, ni revente,
          et nous ne collectons que ce qui sert à afficher les échéances. L'IA ne tire aucune
          conclusion sur votre enfant : ni note, ni difficulté, ni profil.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Finalités et bases légales</TypographyH2>
        <TypographyList>
          <li>
            Afficher les échéances de vos enfants et vous alerter : exécution du service que vous
            demandez (article 6.1.b du RGPD).
          </li>
          <li>
            Lire les annonces avec l'IA pour en tirer les échéances : exécution du service (article
            6.1.b du RGPD), avec un droit d'opposition que vous exercez dans Réglages.
          </li>
          <li>
            Lire un document que vous partagez, comprendre une échéance que vous écrivez, traduire
            ou simplifier une annonce : exécution du service, chaque fois à votre demande.
          </li>
          <li>
            Sécuriser le service et prévenir les abus, dont les quotas d'usage de l'IA : intérêt
            légitime (article 6.1.f du RGPD).
          </li>
        </TypographyList>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Données reçues des API Google</TypographyH2>
        <TypographyP>
          L'utilisation et le transfert à toute autre application des informations reçues des API
          Google respectent la{" "}
          <TextLink href={GOOGLE_USER_DATA_POLICY} target="_blank" rel="noopener noreferrer">
            Google API Services User Data Policy
          </TextLink>
          , y compris ses exigences d'usage limité (Limited Use requirements).
        </TypographyP>
        <TypographyList>
          <li>
            Accès demandés : connexion (openid, email, profile) et lecture seule de Classroom
            (cours, annonces, devoirs de l'élève). Aucune écriture dans Classroom.
          </li>
          <li>Ces données servent uniquement à afficher les échéances et à envoyer vos alertes.</li>
          <li>
            Elles ne sont ni vendues, ni utilisées pour de la publicité, ni pour évaluer une
            solvabilité, ni pour entraîner des modèles d'intelligence artificielle.
          </li>
          <li>
            Personne ne les lit, sauf avec votre accord explicite, pour la sécurité, ou si la loi
            l'impose.
          </li>
        </TypographyList>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Intelligence artificielle (Anthropic)</TypographyH2>
        <TypographyP>
          Certaines lectures passent par les modèles Claude d'Anthropic, PBC, qui agit comme
          sous-traitant. Les devoirs Classroom, eux, sont lus sans intelligence artificielle.
        </TypographyP>
        <TypographyList>
          <li>
            Annonces : leur texte et leur date de publication sont envoyés pour en tirer les
            échéances, après minimisation. Les prénoms de vos enfants y sont remplacés par
            [ENFANT_1], [ENFANT_2], et les adresses e-mail, numéros de téléphone et liens en sont
            retirés.
          </li>
          <li>
            Documents, échéances écrites en langage courant, traductions : envoyés seulement quand
            vous le demandez, et l'écran vous le dit au moment de l'envoi. Une photo, un PDF ou un
            texte que vous partagez n'est jamais stocké, ni chez nous ni chez Anthropic.
          </li>
          <li>
            Chez Anthropic : rétention zéro demandée, donc rien n'est gardé après la réponse, et
            aucun entraînement de ses modèles sur ces données.
          </li>
          <li>
            Ce que nous gardons : la phrase de l'annonce d'où vient une date (jamais plus de 300
            caractères), conservée avec l'échéance et effacée avec elle ; le journal technique et
            les compteurs d'usage décrits plus haut, sans aucun contenu.
          </li>
          <li>
            Résultats partagés : quand une annonce a déjà été lue, son résultat est réutilisé plutôt
            que de la renvoyer au modèle. Ce résultat est rangé sous une empreinte (SHA-256) du
            texte de l'annonce, sa date de publication, le fuseau horaire et la version de nos
            instructions au modèle ; il ne contient aucune donnée de votre famille et n'est lié à
            aucun compte. Il n'est donc pas effacé avec votre compte, mais 60 jours après sa
            dernière lecture.
          </li>
          <li>
            Opposition : dans Réglages, désactivez « Lecture des annonces par l'IA ». Plus aucune
            annonce n'est alors envoyée au modèle et seuls les devoirs Classroom restent lus, sans
            IA.
          </li>
          <li>
            Tout ce que l'IA produit est marqué comme tel, à l'écran et dans les données (règlement
            européen sur l'IA, article 50). Rien n'est ajouté à votre agenda depuis un document ou
            une phrase sans votre validation.
          </li>
          <li>
            Quotas : chaque fonction à la demande a un quota mensuel par famille, pour tenir les
            coûts et prévenir les abus. Quand il est atteint, l'application vous dit à quelle date
            il revient. Aucun quota ne coupe la lecture des annonces.
          </li>
        </TypographyList>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Sous-traitants et transferts</TypographyH2>
        <TypographyP>
          Google, Anthropic, Resend, Vercel et Neon traitent des données pour notre compte. Les
          fonctions de l'API et la base de données sont hébergées dans l'Union européenne, à
          Francfort. Les fichiers de l'application et du site sont servis par le réseau mondial de
          Vercel, depuis son point le plus proche de vous, et chaque requête vers l'API entre par ce
          réseau avant d'atteindre Francfort. Ces prestataires sont établis aux États-Unis, Neon par
          sa société mère Databricks : les transferts reposent sur le cadre EU-US Data Privacy
          Framework ou sur les clauses contractuelles types de la Commission européenne. La liste à
          jour est dans le{" "}
          <TextLink asChild>
            <Link to="/legal/sub-processors">registre des sous-traitants</Link>
          </TextLink>
          .
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Durées de conservation</TypographyH2>
        <TypographyList>
          <li>
            Texte des annonces : aucune conservation en entier après l'extraction ; le passage cité
            et ses phrases voisines suivent la durée de leur échéance et sont effacés avec elle.
          </li>
          <li>
            Lecture partagée d'une annonce (échéances et passages cités, sans aucun lien avec votre
            compte ni le texte entier) : elle évite de relire la même annonce pour chaque famille de
            la classe, et seule une famille dont la synchronisation lit déjà ce texte peut l'obtenir
            ; effacée 60 jours après sa dernière lecture, elle ne contient rien qui vous concerne et
            reste donc après la suppression de votre compte.
          </li>
          <li>Photos, PDF et textes que vous partagez : jamais conservés.</li>
          <li>
            Journal technique des appels au modèle : 90 jours, effacé avec votre compte et compris
            dans la copie de vos données que vous pouvez obtenir.
          </li>
          <li>
            Compteurs d'usage de l'IA : 13 mois, effacés avec votre compte et compris dans cette
            même copie.
          </li>
          <li>
            Préférences : tant que votre compte existe, effacées avec lui et comprises dans cette
            même copie.
          </li>
          <li>Compte et enfants liés : tant que votre compte existe.</li>
          <li>Échéances : 12 mois après leur date, puis effacées avec leurs rappels et alertes.</li>
          <li>
            Échéance que vous supprimez ou que l'enseignant retire : effacée 30 jours plus tard ; un
            devoir Classroom reste au moins 61 jours après sa date, pour qu'une synchronisation ne
            le recrée pas.
          </li>
          <li>Enfant retiré : ses accès Google sont révoqués et ses données effacées aussitôt.</li>
          <li>
            Compte supprimé : effacement complet 7 jours après la demande, passages cités compris,
            délai pendant lequel vous pouvez annuler.
          </li>
          <li>Choix et envois du résumé du dimanche : tant que votre compte existe.</li>
          <li>E-mails envoyés : 7 jours au plus.</li>
          <li>
            Abonnement aux notifications d'un appareil : jusqu'à sa désactivation, votre déconnexion
            de cet appareil ou son expiration.
          </li>
          <li>
            Lien d'agenda : jusqu'à sa révocation, son remplacement ou la suppression de votre
            compte ; il cesse alors aussitôt de fonctionner.
          </li>
        </TypographyList>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Révoquer l'accès</TypographyH2>
        <TypographyP>
          Retirez un enfant depuis l'écran Enfants : nous révoquons son accès auprès de Google et
          effaçons ses données. Vous pouvez aussi retirer l'application depuis{" "}
          <TextLink
            href="https://myaccount.google.com/connections"
            target="_blank"
            rel="noopener noreferrer"
          >
            les connexions de votre compte Google
          </TextLink>
          ; l'application vous demandera alors de reconnecter l'enfant.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Vos droits</TypographyH2>
        <TypographyP>
          Vous disposez des droits d'accès, de rectification, d'effacement, de limitation,
          d'opposition et de portabilité. La suppression du compte et l'opposition à la lecture des
          annonces par l'IA se font dans Réglages ; pour les autres droits, écrivez à{" "}
          <ContactLink />. Vous pouvez aussi saisir la CNIL (cnil.fr). Le détail est sur la page{" "}
          <TextLink asChild>
            <Link to="/legal/data-rights">vos droits sur vos données</Link>
          </TextLink>
          .
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Sécurité et cookies</TypographyH2>
        <TypographyP>
          Les échanges sont chiffrés (HTTPS) et les jetons Google sont chiffrés en base
          (XChaCha20-Poly1305). L'application ne dépose que les cookies nécessaires à la connexion,
          détaillés sur la page{" "}
          <TextLink asChild>
            <Link to="/legal/cookies">cookies</Link>
          </TextLink>
          .
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Modifications</TypographyH2>
        <TypographyP>
          Nous vous prévenons par e-mail avant tout changement important de cette politique.
        </TypographyP>
      </section>
    </div>
  );
}

export function TermsBody(): ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <TypographyH2>Le service</TypographyH2>
        <TypographyP>
          L'application rassemble les échéances scolaires de vos enfants à partir de leur compte
          Google Classroom et vous alerte avant chacune d'elles. Elle est gratuite et ne lit
          Classroom qu'en lecture seule.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Votre compte</TypographyH2>
        <TypographyP>
          Vous vous connectez avec votre compte Google. Vous ne liez que les comptes d'enfants dont
          vous êtes parent ou représentant légal.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Fiabilité des échéances</TypographyH2>
        <TypographyP>
          Les dates des annonces sont extraites automatiquement et peuvent être fausses : une
          échéance douteuse est marquée « à vérifier ». Classroom et les enseignants restent la
          référence. Une alerte peut aussi arriver en retard ou pas du tout (téléphone éteint,
          notifications bloquées, panne d'un prestataire) : l'application vous aide, elle ne
          remplace pas votre vigilance.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Disponibilité et responsabilité</TypographyH2>
        <TypographyP>
          Nous faisons notre possible pour que le service fonctionne, sans garantie de
          disponibilité. Notre responsabilité ne peut être engagée pour une échéance manquée.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Fin d'utilisation</TypographyH2>
        <TypographyP>
          Vous pouvez retirer un enfant ou supprimer votre compte à tout moment depuis
          l'application. Nous pouvons suspendre un compte utilisé de façon abusive.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Droit applicable et contact</TypographyH2>
        <TypographyP>
          Ces conditions relèvent du droit français. Pour toute question : <ContactLink />.
        </TypographyP>
      </section>
    </div>
  );
}
